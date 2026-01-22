'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';

      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                break;
              }
              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  assistantMessage += parsed.content;
                  setMessages(prev => {
                    const newMessages = [...prev];
                    newMessages[newMessages.length - 1].content = assistantMessage;
                    return newMessages;
                  });
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [
        ...prev,
        { 
          role: 'assistant', 
          content: 'Sorry, there was an error processing your request. Please try again.' 
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Header */}
      <div className="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700 px-6 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <span className="text-3xl">🦙</span>
            Llama 3.1 70B
          </h1>
          <p className="text-sm text-gray-400 mt-1">Running on Lambda Labs A6000</p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm font-medium"
          >
            Clear Chat
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.length === 0 ? (
            <div className="text-center text-gray-400 mt-20">
              <div className="text-6xl mb-4">🦙</div>
              <h2 className="text-2xl font-semibold mb-2">Start a conversation</h2>
              <p className="text-gray-500">
                Ask me anything - I'm running Llama 3.1 70B on your own hardware
              </p>
              <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                <button
                  onClick={() => setInput("Explain quantum computing like I'm 10")}
                  className="p-4 bg-gray-800/50 hover:bg-gray-700/50 rounded-lg text-left border border-gray-700 hover:border-gray-600 transition-all"
                >
                  <div className="font-medium text-white mb-1">Simple explanation</div>
                  <div className="text-sm text-gray-400">Explain quantum computing</div>
                </button>
                <button
                  onClick={() => setInput("Write a Python function to check if a number is prime")}
                  className="p-4 bg-gray-800/50 hover:bg-gray-700/50 rounded-lg text-left border border-gray-700 hover:border-gray-600 transition-all"
                >
                  <div className="font-medium text-white mb-1">Code generation</div>
                  <div className="text-sm text-gray-400">Write a Python function</div>
                </button>
                <button
                  onClick={() => setInput("What are the key trends in construction technology for 2024?")}
                  className="p-4 bg-gray-800/50 hover:bg-gray-700/50 rounded-lg text-left border border-gray-700 hover:border-gray-600 transition-all"
                >
                  <div className="font-medium text-white mb-1">Industry insights</div>
                  <div className="text-sm text-gray-400">Construction tech trends</div>
                </button>
                <button
                  onClick={() => setInput("Compare public-private partnerships vs traditional procurement")}
                  className="p-4 bg-gray-800/50 hover:bg-gray-700/50 rounded-lg text-left border border-gray-700 hover:border-gray-600 transition-all"
                >
                  <div className="font-medium text-white mb-1">Analysis</div>
                  <div className="text-sm text-gray-400">Compare P3 models</div>
                </button>
              </div>
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-3xl rounded-2xl px-6 py-4 ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800/80 text-gray-100 border border-gray-700'
                  }`}
                >
                  {message.role === 'assistant' ? (
                    <div className="prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {message.content || '...'}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="bg-gray-800/50 backdrop-blur-sm border-t border-gray-700 px-6 py-4">
        <form onSubmit={sendMessage} className="max-w-4xl mx-auto">
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Llama anything..."
              disabled={isLoading}
              className="flex-1 bg-gray-700/50 border border-gray-600 rounded-xl px-6 py-4 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="px-8 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <span className="animate-spin">⏳</span>
                  Thinking...
                </>
              ) : (
                <>
                  Send
                  <span>→</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
