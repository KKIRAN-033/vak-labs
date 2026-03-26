import { useState, useRef, useEffect, useCallback } from "react";
import { Card } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import { ScrollArea } from "./components/ui/scroll-area";
import {
  MessageSquare,
  Send,
  Zap,
  AlertTriangle,
  Moon,
  Users,
  Network,
  Clock,
  MapPin,
  HelpCircle,
  FileText,
} from "lucide-react";

const QUICK_ACTIONS = [
  { label: "Top Contacts", query: "top contacts", icon: Users },
  { label: "Suspicious", query: "suspicious numbers", icon: AlertTriangle },
  { label: "Night Activity", query: "night activity", icon: Moon },
  { label: "Most Active", query: "most active entities", icon: Zap },
  { label: "Connections", query: "unique connections", icon: Network },
  { label: "Timeline", query: "peak activity time", icon: Clock },
  { label: "Movement", query: "movement patterns", icon: MapPin },
  { label: "Summary", query: "summary report", icon: FileText },
];

function ChatMessage({ msg, index }) {
  const isUser = msg.role === "user";
  return (
    <div
      className={`chat-message flex ${isUser ? "justify-end" : "justify-start"}`}
      style={{ animationDelay: `${index * 30}ms` }}
      data-testid={`chat-message-${index}`}
    >
      <div
        className={`max-w-[90%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
          isUser
            ? "bg-primary/15 text-foreground border border-primary/20"
            : "bg-secondary/60 text-foreground border border-border/40"
        }`}
      >
        {!isUser && msg.query_type && (
          <Badge variant="secondary" className="text-[8px] px-1 py-0 mb-1.5 block w-fit">
            {msg.query_type}
          </Badge>
        )}
        <pre className="whitespace-pre-wrap font-sans text-xs">{msg.content}</pre>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start" data-testid="typing-indicator">
      <div className="bg-secondary/60 border border-border/40 rounded-lg px-4 py-2.5 flex gap-1.5">
        <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground" />
        <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground" />
        <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground" />
      </div>
    </div>
  );
}

export default function ChatPanel({ apiUrl, selectedDataset }) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        'Welcome to Telecom Forensics AI. Upload a dataset and ask me about suspicious activity, top contacts, night patterns, and more. Type "help" for all commands.',
      query_type: "welcome",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  const sendQuery = useCallback(
    async (text) => {
      const query = text.trim();
      if (!query) return;

      setMessages((prev) => [...prev, { role: "user", content: query }]);
      setInput("");
      setSending(true);

      try {
        const res = await fetch(`${apiUrl}/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: query,
            dataset_id: selectedDataset?.id || null,
          }),
        });
        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.response,
            query_type: data.query_type,
            data: data.data,
          },
        ]);
      } catch (e) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Connection error. Please try again.",
            query_type: "error",
          },
        ]);
      } finally {
        setSending(false);
        inputRef.current?.focus();
      }
    },
    [apiUrl, selectedDataset]
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    sendQuery(input);
  };

  return (
    <aside
      className="w-80 border-l border-border/60 bg-card/40 flex flex-col shrink-0"
      data-testid="chat-panel"
    >
      {/* Header */}
      <div className="h-10 border-b border-border/40 px-3 flex items-center gap-2 shrink-0">
        <MessageSquare className="h-3.5 w-3.5 text-primary" strokeWidth={1.5} />
        <span className="text-xs font-medium text-foreground">Forensic Assistant</span>
        {selectedDataset && (
          <Badge variant="secondary" className="text-[8px] px-1 py-0 ml-auto">
            {selectedDataset.dataset_type}
          </Badge>
        )}
      </div>

      {/* Quick Actions */}
      <div className="p-2 border-b border-border/40">
        <div className="flex flex-wrap gap-1">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.query}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              data-testid={`quick-action-${action.query.replace(/\s+/g, "-")}`}
              onClick={() => sendQuery(action.query)}
              disabled={sending}
            >
              <action.icon className="h-2.5 w-2.5" />
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3" ref={scrollRef} data-testid="chat-messages">
        {messages.map((msg, i) => (
          <ChatMessage key={i} msg={msg} index={i} />
        ))}
        {sending && <TypingIndicator />}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="p-2 border-t border-border/40 flex gap-1.5"
        data-testid="chat-input-form"
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about the data..."
          className="flex-1 h-8 rounded-md border border-input bg-transparent px-3 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          data-testid="chat-input"
          disabled={sending}
        />
        <Button
          type="submit"
          size="sm"
          className="h-8 w-8 p-0"
          data-testid="chat-send-btn"
          disabled={sending || !input.trim()}
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </form>
    </aside>
  );
}
