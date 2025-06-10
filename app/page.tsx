'use client';

import type React from 'react';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  MessageCircle,
  Phone,
  LogOut,
  Send,
  PhoneOff,
  Headphones,
  AlertCircle,
  CheckCircle,
  Clock,
  Paperclip,
  File,
  Image,
  FileVideo,
  FileAudio,
} from 'lucide-react';
import { io, type Socket } from 'socket.io-client';
import { useSession } from 'next-auth/react';

interface Atendimento {
  sessao_id: string;
  numero: string;
  setor: string;
  assunto?: string;
  estudante?: {
    nome: string;
  };
}

interface Message {
  sender: 'usuario' | 'atendente';
  mensagem: string;
  origem?: 'whatsapp' | 'web';
  mediaUrl?: string;
  mediaType?: 'image' | 'document' | 'video' | 'audio';
  fileName?: string;
}

interface SessaoAtual {
  sessao_id: string;
  setor: string;
  protocolo: string;
}

type ConnectionStatus = 'connected' | 'disconnected' | 'error';

const API_BASE_URL = 'http://localhost:3055';
const FRONTEND_URL = 'http://localhost:3000';
const SOCKET_URL = 'http://localhost:3055/atendimento';

interface User {
  id: string;
  nome: string;
  email: string;
  cargo: string;
  departamento: string;
}

export default function PainelAtendente() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [atendimentosAbertos, setAtendimentosAbertos] = useState<Atendimento[]>(
    []
  );
  const [sessaoAtual, setSessaoAtual] = useState<SessaoAtual | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  console.log('messages', messages);
  const [messageInput, setMessageInput] = useState('');
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isFileUploading, setIsFileUploading] = useState(false);
  const [mediaType, setMediaType] = useState<
    'image' | 'document' | 'video' | 'audio'
  >('document');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, status } = useSession();
  console.log('Session data:', data?.user);
  console.log('Session status:', status);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Verificar autenticação existente
  useEffect(() => {
    checkExistingAuth();
  }, []);

  // Verificar callback do OAuth
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const error = urlParams.get('error');

    if (error) {
      showError('Erro na autenticação: ' + decodeURIComponent(error));
      return;
    }

    if (token) {
      setAccessToken(token);
      localStorage.setItem('access_token', token);
      fetchUserProfile(token);
      // Limpar a URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Auto scroll para última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Limpar alertas automaticamente
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  const checkExistingAuth = () => {
    const token = localStorage.getItem('access_token');
    const userData = localStorage.getItem('user_data');

    if (token && userData) {
      setAccessToken(token);
      setCurrentUser(JSON.parse(userData));
      connectToSocket(token, JSON.parse(userData));
    }
  };

  const loginWithGoogle = () => {
    window.location.href = `${API_BASE_URL}/auth/google`;
  };

  const fetchUserProfile = async (token: string) => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_BASE_URL}/atendentes/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Falha ao buscar perfil do usuário');
      }

      const userData = await response.json();
      setCurrentUser(userData);
      localStorage.setItem('user_data', JSON.stringify(userData));
      connectToSocket(token, userData);
    } catch (error) {
      console.error('Erro ao buscar perfil:', error);
      showError(
        'Erro ao carregar perfil do usuário: ' + (error as Error).message
      );
      logout();
    } finally {
      setIsLoading(false);
    }
  };

  const connectToSocket = (token: string, user: User) => {
    if (socket) {
      socket.disconnect();
    }

    const newSocket = io(SOCKET_URL, {
      auth: {
        token,
        atendenteId: user.id,
        nome: user.nome,
        setor: user.departamento || 'Geral',
      },
    });

    newSocket.on('connect', () => {
      console.log('Conectado ao servidor de atendimento');
      setConnectionStatus('connected');
      buscarAtendimentos(newSocket);
      // Buscar atendimentos a cada 5 segundos
      const interval = setInterval(() => buscarAtendimentos(newSocket), 5000);

      return () => clearInterval(interval);
    });

    newSocket.on('disconnect', () => {
      console.log('Desconectado do servidor');
      setConnectionStatus('disconnected');
    });

    newSocket.on('connect_error', (error) => {
      console.error('Erro de conexão:', error);
      setConnectionStatus('error');
    });

    newSocket.on('atendimentosAbertos', (data: Atendimento[]) => {
      setAtendimentosAbertos(data);
    });

    newSocket.on('novaMensagem', (data: Message & { sessao_id: string }) => {
      console.log('Nova mensagem recebida:', data);
      if (data.sender === 'usuario') {
        setMessages((prev) => [...prev, data]);
      }
    });

    newSocket.on('atendenteEntrou', (data: { nome: string; setor: string }) => {
      addSystemMessage(
        `Atendente ${data.nome} do setor ${data.setor} entrou no atendimento.`
      );
    });

    newSocket.on('atendimentoEncerrado', () => {
      addSystemMessage('Este atendimento foi encerrado.');
      setTimeout(() => {
        alert('O atendimento foi encerrado.');
        fecharChat();
      }, 1000);
    });

    setSocket(newSocket);
  };

  const buscarAtendimentos = (socketInstance: Socket) => {
    if (socketInstance && socketInstance.connected) {
      socketInstance.emit('listarAtendimentos');
    }
  };

  const entrarAtendimento = (
    sessao_id: string,
    setor: string,
    protocolo: string
  ) => {
    const novaSessao = { sessao_id, setor, protocolo };
    setSessaoAtual(novaSessao);
    setMessages([]);

    const atendimento = atendimentosAbertos.find(
      (a) => a.sessao_id === sessao_id
    );
    const origem = atendimento?.assunto?.includes('WhatsApp')
      ? 'WhatsApp'
      : 'Web';

    socket?.emit('entrarAtendimento', {
      sessao_id,
      nome: currentUser?.nome,
      setor: currentUser?.departamento || 'Geral',
      atendenteId: currentUser?.id,
    });

    addSystemMessage(
      `Você entrou no atendimento. Origem: ${origem}. Suas mensagens serão enviadas diretamente para o usuário.`
    );
  };

  const addSystemMessage = (mensagem: string) => {
    setMessages((prev) => [
      ...prev,
      {
        sender: 'usuario' as const,
        mensagem: `🔔 ${mensagem}`,
        origem: 'web',
      },
    ]);
  };

  const enviarMensagem = () => {
    const mensagem = messageInput.trim();
    if (!mensagem || !sessaoAtual || !socket) return;
    console.log('Enviando mensagem:', sessaoAtual.sessao_id);

    socket.emit('enviarMensagem', {
      sessao_id: sessaoAtual.sessao_id,
      mensagem,
      sender: 'atendente',
    });

    setMessages((prev) => [
      ...prev,
      {
        sender: 'atendente',
        mensagem,
      },
    ]);

    setMessageInput('');
  };

  const encerrarAtendimento = () => {
    if (!sessaoAtual || !socket) return;

    if (confirm('Deseja realmente encerrar este atendimento?')) {
      socket.emit('encerrarAtendimento', {
        sessao_id: sessaoAtual.sessao_id,
      });
      addSystemMessage('Você encerrou este atendimento.');
      setTimeout(fecharChat, 1000);
    }
  };

  const fecharChat = () => {
    setSessaoAtual(null);
    setMessages([]);
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user_data');

    if (socket) {
      socket.disconnect();
      setSocket(null);
    }

    setCurrentUser(null);
    setAccessToken(null);
    setSessaoAtual(null);
    setMessages([]);
    setConnectionStatus('disconnected');
  };

  const showError = (message: string) => {
    setError(message);
  };

  const showSuccess = (message: string) => {
    setSuccess(message);
  };

  const getStatusBadge = () => {
    switch (connectionStatus) {
      case 'connected':
        return <Badge className='bg-green-500'>🟢 Conectado</Badge>;
      case 'error':
        return <Badge variant='destructive'>❌ Erro de conexão</Badge>;
      default:
        return <Badge variant='secondary'>🔴 Desconectado</Badge>;
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      enviarMensagem();
    }
  };

  const renderMediaContent = (message: Message) => {
    if (!message.mediaUrl) return <p>{message.mensagem}</p>;

    switch (message.mediaType) {
      case 'image':
        return (
          <div className='space-y-2'>
            {message.mensagem && <p>{message.mensagem}</p>}
            <img
              src={message.mediaUrl}
              alt='Imagem'
              className='max-w-full rounded-md max-h-64'
            />
          </div>
        );
      case 'document':
        return (
          <div className='space-y-2'>
            {message.mensagem && <p>{message.mensagem}</p>}
            <div className='flex items-center p-2 bg-gray-100 rounded-md'>
              <File className='h-5 w-5 mr-2' />
              <a
                href={message.mediaUrl}
                target='_blank'
                rel='noopener noreferrer'
                className='text-blue-600 underline'>
                {message.fileName || 'Documento'}
              </a>
            </div>
          </div>
        );
      case 'video':
        return (
          <div className='space-y-2'>
            {message.mensagem && <p>{message.mensagem}</p>}
            <video controls className='max-w-full rounded-md max-h-64'>
              <source src={message.mediaUrl} />
              Seu navegador não suporta o elemento de vídeo.
            </video>
          </div>
        );
      case 'audio':
        return (
          <div className='space-y-2'>
            {message.mensagem && <p>{message.mensagem}</p>}
            <audio controls className='w-full'>
              <source src={message.mediaUrl} />
              Seu navegador não suporta o elemento de áudio.
            </audio>
          </div>
        );
      default:
        return <p>{message.mensagem}</p>;
    }
  };

  const detectMediaType = (file: File) => {
    const type = file.type.split('/')[0];
    if (type === 'image') return 'image';
    if (type === 'video') return 'video';
    if (type === 'audio') return 'audio';
    return 'document';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setMediaType(detectMediaType(file));
    }
  };

  const openFileSelector = () => {
    fileInputRef.current?.click();
  };

  const cancelFileUpload = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const enviarArquivo = async () => {
    if (!selectedFile || !sessaoAtual || !socket || !accessToken) return;
    setIsFileUploading(true);

    try {
      const formData = new FormData();

      // Encontrar o estudante associado a este atendimento
      const atendimento = atendimentosAbertos.find(
        (a) => a.sessao_id === sessaoAtual.sessao_id
      );
      if (!atendimento) throw new Error('Atendimento não encontrado');
      
      // Extrair número de telefone (precisa ser implementado corretamente)
      // Este é um placeholder - você precisará buscar o número correto do WhatsApp
      // do estudante associado à sessão atual
      console.log('Atendimento encontrado:', atendimento);
      const phoneNumber = atendimento.sessao_id;

      formData.append('number', phoneNumber);
      formData.append(
        'caption',
        messageInput || 'Arquivo enviado pelo atendente'
      );
      formData.append('attachment', selectedFile);
      formData.append('mediatype', mediaType);
      formData.append('presence', 'composing');

      const instanceName = await fetch(
        `${API_BASE_URL}/whatsapp/getInstanceName`
      )
        .then((res) => res.json())
        .then((data) => data.instanceName);
        console.log('Instance Name:', instanceName);

      const response = await fetch(
        `${API_BASE_URL}/whatsapp/sendMediaFile/${atendimento.numero}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error('Falha ao enviar arquivo');
      }

      const data = await response.json();

      // Criar URL temporária para o arquivo (no caso real, isso viria da API)
      const fileUrl = URL.createObjectURL(selectedFile);

      // Adicionar mensagem com mídia ao chat
      setMessages((prev) => [
        ...prev,
        {
          sender: 'atendente',
          mensagem: messageInput,
          mediaUrl: fileUrl,
          mediaType,
          fileName: selectedFile.name,
        },
      ]);

      // Registrar mensagem no socket
      socket.emit('enviarMensagem', {
        sessao_id: sessaoAtual.sessao_id,
        mensagem: `[Arquivo: ${selectedFile.name}] ${messageInput || ''}`,
        sender: 'atendente',
        mediaUrl: data.mediaUrl || fileUrl,
        mediaType,
        fileName: selectedFile.name,
      });

      setMessageInput('');
      cancelFileUpload();
      showSuccess('Arquivo enviado com sucesso!');
    } catch (error) {
      console.error('Erro ao enviar arquivo:', error);
      showError(`Erro ao enviar arquivo: ${(error as Error).message}`);
    } finally {
      setIsFileUploading(false);
    }
  };

  return (
    <div className='min-h-screen bg-gray-50 p-4'>
      <div className='max-w-6xl mx-auto'>
        <Card>
          <CardHeader>
            <div className='flex justify-between items-center'>
              <CardTitle className='flex items-center gap-2'>
                <Headphones className='h-6 w-6' />
                Painel do Atendente - IFCE
              </CardTitle>
              {getStatusBadge()}
            </div>
          </CardHeader>

          <CardContent className='space-y-6'>
            {/* Alertas */}
            {error && (
              <Alert variant='destructive'>
                <AlertCircle className='h-4 w-4' />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert>
                <CheckCircle className='h-4 w-4' />
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}

            {/* Seção de Login */}
            {!currentUser && (
              <Card>
                <CardHeader>
                  <CardTitle className='text-center'>
                    🔐 Autenticação Necessária
                  </CardTitle>
                </CardHeader>
                <CardContent className='text-center space-y-4'>
                  <p>
                    Para acessar o painel de atendimento, você precisa fazer
                    login com sua conta institucional do IFCE.
                  </p>
                  <Button
                    onClick={loginWithGoogle}
                    disabled={isLoading}
                    className='bg-blue-600 hover:bg-blue-700'>
                    <svg className='w-4 h-4 mr-2' viewBox='0 0 18 18'>
                      <path
                        fill='#4285F4'
                        d='M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z'
                      />
                      <path
                        fill='#34A853'
                        d='M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.04a4.8 4.8 0 01-7.18-2.53H1.83v2.07A8 8 0 008.98 17z'
                      />
                      <path
                        fill='#FBBC04'
                        d='M4.5 10.49a4.8 4.8 0 010-3.07V5.35H1.83a8 8 0 000 7.28l2.67-2.14z'
                      />
                      <path
                        fill='#EA4335'
                        d='M8.98 3.54c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 001.83 5.35L4.5 7.42c.64-1.9 2.26-3.88 4.48-3.88z'
                      />
                    </svg>
                    {isLoading ? 'Carregando...' : 'Entrar com Google'}
                  </Button>
                  <Button
                    onClick={() =>
                      (window.location.href = `${FRONTEND_URL}/api/auth/signin`)
                    }
                    disabled={isLoading}></Button>
                  <p className='text-sm text-gray-600'>
                    Apenas emails institucionais (@ifce.edu.br) são aceitos
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Informações do Usuário */}
            {currentUser && (
              <Card className='bg-green-50'>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    <Headphones className='h-5 w-5' />
                    Atendente Logado
                  </CardTitle>
                </CardHeader>
                <CardContent className='space-y-2'>
                  <p>
                    <strong>Nome:</strong> {currentUser.nome}
                  </p>
                  <p>
                    <strong>Email:</strong> {currentUser.email}
                  </p>
                  <p>
                    <strong>Cargo:</strong> {currentUser.cargo}
                  </p>
                  <p>
                    <strong>Departamento:</strong> {currentUser.departamento}
                  </p>
                  <Button onClick={logout} variant='destructive' size='sm'>
                    <LogOut className='h-4 w-4 mr-2' />
                    Logout
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Painel Principal */}
            {currentUser && (
              <>
                {/* Lista de Atendimentos */}
                <Card>
                  <CardHeader>
                    <CardTitle className='flex items-center gap-2'>
                      <Clock className='h-5 w-5' />
                      Atendimentos Aguardando
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {atendimentosAbertos.length === 0 ? (
                      <p className='text-center text-gray-500 py-8'>
                        📭 Nenhum atendimento aguardando no momento
                      </p>
                    ) : (
                      <div className='space-y-3'>
                        {atendimentosAbertos.map((atendimento) => {
                          const origem = atendimento.assunto?.includes(
                            'WhatsApp'
                          )
                            ? 'WhatsApp'
                            : 'Web';
                          const estudanteNome =
                            atendimento.estudante?.nome || 'Não identificado';

                          return (
                            <Card
                              key={atendimento.sessao_id}
                              className='border-l-4 border-l-blue-500'>
                              <CardContent className='p-4'>
                                <div className='flex justify-between items-center'>
                                  <div className='space-y-2'>
                                    <div className='flex items-center gap-2'>
                                      <Badge
                                        variant={
                                          origem === 'WhatsApp'
                                            ? 'default'
                                            : 'secondary'
                                        }>
                                        {origem}
                                      </Badge>
                                      <span>
                                        <strong>Protocolo:</strong>{' '}
                                        {atendimento.numero}
                                      </span>
                                    </div>
                                    <p>
                                      <strong>Setor:</strong>{' '}
                                      {atendimento.setor}
                                    </p>
                                    <p>
                                      <strong>Estudante:</strong>{' '}
                                      {estudanteNome}
                                    </p>
                                    <p>
                                      <strong>Sessão:</strong>{' '}
                                      {atendimento.sessao_id.substring(0, 12)}
                                      ...
                                    </p>
                                  </div>
                                  <Button
                                    onClick={() =>
                                      entrarAtendimento(
                                        atendimento.sessao_id,
                                        atendimento.setor,
                                        atendimento.numero
                                      )
                                    }
                                    className='bg-green-600 hover:bg-green-700'>
                                    <Phone className='h-4 w-4 mr-2' />
                                    Atender
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Chat */}
                {sessaoAtual && (
                  <Card>
                    <CardHeader className='bg-blue-600 text-white'>
                      <div className='flex justify-between items-center'>
                        <div>
                          <CardTitle className='flex items-center gap-2'>
                            <MessageCircle className='h-5 w-5' />
                            Chat Ativo
                          </CardTitle>
                          <p className='text-blue-100 mt-1'>
                            <strong>Protocolo:</strong> {sessaoAtual.protocolo}{' '}
                            |<strong> Setor:</strong> {sessaoAtual.setor}
                          </p>
                        </div>
                        <Button
                          onClick={encerrarAtendimento}
                          variant='destructive'
                          size='sm'>
                          <PhoneOff className='h-4 w-4 mr-2' />
                          Encerrar
                        </Button>
                      </div>
                    </CardHeader>

                    <CardContent className='p-0'>
                      {/* Mensagens */}
                      <div className='h-96 overflow-y-auto p-4 bg-gray-50 space-y-3'>
                        {messages.map((message, index) => (
                          <div
                            key={index}
                            className={`max-w-[70%] p-3 rounded-lg ${
                              message.sender === 'usuario'
                                ? message.mensagem.startsWith('🔔')
                                  ? 'mx-auto bg-orange-100 text-orange-800 text-center border border-orange-200'
                                  : `bg-blue-100 ${
                                      message.origem === 'whatsapp'
                                        ? 'border-l-4 border-l-green-500'
                                        : ''
                                    }`
                                : 'bg-green-100 ml-auto text-right'
                            }`}>
                            {message.sender === 'usuario' &&
                              !message.mensagem.startsWith('🔔') && (
                                <p className='font-semibold text-sm mb-1'>
                                  👤 Usuário:
                                </p>
                              )}
                            {message.sender === 'atendente' && (
                              <p className='font-semibold text-sm mb-1'>
                                🎧 {currentUser?.nome}:
                              </p>
                            )}
                            {renderMediaContent(message)}
                          </div>
                        ))}
                        <div ref={messagesEndRef} />
                      </div>

                      <Separator />

                      {/* Visualização do arquivo selecionado */}
                      {selectedFile && (
                        <div className='p-3 bg-blue-50 m-2 rounded-md'>
                          <div className='flex justify-between items-center'>
                            <div className='flex items-center space-x-2'>
                              {mediaType === 'image' && (
                                <Image className='h-5 w-5' />
                              )}
                              {mediaType === 'document' && (
                                <File className='h-5 w-5' />
                              )}
                              {mediaType === 'video' && (
                                <FileVideo className='h-5 w-5' />
                              )}
                              {mediaType === 'audio' && (
                                <FileAudio className='h-5 w-5' />
                              )}
                              <span className='text-sm font-medium truncate max-w-[200px]'>
                                {selectedFile.name}
                              </span>
                              <span className='text-xs text-gray-500'>
                                ({(selectedFile.size / 1024).toFixed(1)} KB)
                              </span>
                            </div>
                            <div className='flex space-x-2'>
                              <Button
                                variant='outline'
                                size='sm'
                                onClick={cancelFileUpload}>
                                Cancelar
                              </Button>
                              <Button
                                size='sm'
                                onClick={enviarArquivo}
                                disabled={isFileUploading}>
                                {isFileUploading
                                  ? 'Enviando...'
                                  : 'Enviar arquivo'}
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Input de mensagem */}
                      <div className='p-4 flex gap-2'>
                        <input
                          ref={fileInputRef}
                          type='file'
                          onChange={handleFileSelect}
                          className='hidden'
                        />
                        <Button
                          variant='outline'
                          size='icon'
                          onClick={openFileSelector}
                          title='Anexar arquivo'>
                          <Paperclip className='h-4 w-4' />
                        </Button>
                        <Input
                          value={messageInput}
                          onChange={(e) => setMessageInput(e.target.value)}
                          onKeyPress={handleKeyPress}
                          placeholder='Digite sua mensagem...'
                          maxLength={1000}
                          className='flex-1'
                        />
                        <Button
                          onClick={
                            selectedFile ? enviarArquivo : enviarMensagem
                          }
                          disabled={
                            (!messageInput.trim() && !selectedFile) ||
                            isFileUploading
                          }>
                          <Send className='h-4 w-4' />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
