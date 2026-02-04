'use client';

import { useEffect, useState, useRef } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Send, User as UserIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface ChatProps {
    projectId: string;
}

export function ProjectCommunication({ projectId }: ChatProps) {
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [threadId, setThreadId] = useState<string | null>(null);
    const [sending, setSending] = useState(false);

    // Auto-scroll
    const bottomRef = useRef<HTMLDivElement>(null);

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    useEffect(() => {
        if (!projectId) return;

        async function initChat() {
            // 1. Find or Create Thread for Project
            let { data: thread } = await supabase
                .from('communication_threads')
                .select('id')
                .eq('project_id', projectId)
                .eq('type', 'GENERAL')
                .single();

            if (!thread) {
                const { data: newThread } = await supabase
                    .from('communication_threads')
                    .insert({ project_id: projectId, type: 'GENERAL', title: 'Chat General' })
                    .select()
                    .single();
                thread = newThread;
            }

            if (thread) {
                setThreadId(thread.id);
                // 2. Load Messages
                const { data: msgs } = await supabase
                    .from('communication_messages')
                    .select(`
                        *,
                        sender:profiles(email, first_name)
                    `)
                    .eq('thread_id', thread.id)
                    .order('created_at', { ascending: true });

                if (msgs) setMessages(msgs);

                // 3. Subscribe to new messages
                const channel = supabase
                    .channel(`thread:${thread.id}`)
                    .on('postgres_changes', {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'communication_messages',
                        filter: `thread_id=eq.${thread.id}`
                    }, async (payload) => {
                        // Fetch sender info for the new message
                        const { data: sender } = await supabase
                            .from('profiles')
                            .select('email, first_name')
                            .eq('id', payload.new.sender_id)
                            .single();

                        const newMsg = { ...payload.new, sender };
                        setMessages(current => [...current, newMsg]);
                    })
                    .subscribe();

                return () => { supabase.removeChannel(channel); };
            }
        }

        initChat();
    }, [projectId]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendMessage = async () => {
        if (!newMessage.trim() || !threadId) return;
        setSending(true);

        try {
            await supabase.from('communication_messages').insert({
                thread_id: threadId,
                content: newMessage,
                sender_id: (await supabase.auth.getUser()).data.user?.id
            });
            setNewMessage('');
        } catch (error) {
            console.error(error);
        } finally {
            setSending(false);
        }
    };

    return (
        <Card className="h-[600px] flex flex-col">
            <CardHeader className="py-3 border-b">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    Chat del Proyecto
                </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 bg-neutral-50">
                {messages.length === 0 && (
                    <div className="text-center text-neutral-400 text-sm mt-10">
                        No hay mensajes aún. ¡Inicia la conversación!
                    </div>
                )}
                {messages.map((msg) => (
                    <div key={msg.id} className="flex gap-3">
                        <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-xs font-bold">
                            {msg.sender?.first_name?.[0]?.toUpperCase() || <UserIcon className="h-4 w-4" />}
                        </div>
                        <div className="bg-white p-3 rounded-lg border border-neutral-200 shadow-sm max-w-[80%]">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-semibold text-neutral-700">
                                    {msg.sender?.first_name || msg.sender?.email}
                                </span>
                                <span className="text-[10px] text-neutral-400">
                                    {format(new Date(msg.created_at), 'p', { locale: es })}
                                </span>
                            </div>
                            <p className="text-sm text-neutral-800 whitespace-pre-wrap">{msg.content}</p>
                        </div>
                    </div>
                ))}
                <div ref={bottomRef} />
            </CardContent>
            <CardFooter className="p-3 border-t bg-white">
                <form
                    className="flex w-full gap-2"
                    onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
                >
                    <Input
                        placeholder="Escribe un mensaje..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        disabled={sending}
                    />
                    <Button type="submit" size="icon" disabled={sending || !newMessage.trim()} className="shrink-0 bg-emerald-600">
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                </form>
            </CardFooter>
        </Card>
    );
}
