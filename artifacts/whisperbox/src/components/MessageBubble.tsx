import { motion } from "framer-motion";
import { format } from "date-fns";
import { ShieldAlert } from "lucide-react";

interface MessageBubbleProps {
  message: {
    id: string;
    text: string;
    createdAt: string;
    isSentByMe: boolean;
    failedToDecrypt?: boolean;
    isDecrypting?: boolean;
  };
  index: number;
}

export function MessageBubble({ message, index }: MessageBubbleProps) {
  const time = format(new Date(message.createdAt), "h:mm a");

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.05, 0.5) }}
      className={`flex w-full mb-4 ${message.isSentByMe ? "justify-end" : "justify-start"}`}
    >
      <div 
        className={`relative max-w-[75%] px-4 py-2.5 rounded-2xl ${
          message.isSentByMe 
            ? "bg-teal-600 text-white rounded-br-sm" 
            : "bg-[#2d333b] text-gray-100 rounded-bl-sm"
        }`}
      >
        {message.isDecrypting ? (
          <div className="flex items-center space-x-1 h-5">
            <div className="w-1.5 h-1.5 bg-current opacity-40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <div className="w-1.5 h-1.5 bg-current opacity-40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <div className="w-1.5 h-1.5 bg-current opacity-40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
        ) : message.failedToDecrypt ? (
          <div className="flex items-center gap-2 text-red-300 text-sm">
            <ShieldAlert className="w-4 h-4" />
            <span className="italic">Unable to decrypt message</span>
          </div>
        ) : (
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{message.text}</p>
        )}
        
        <div 
          className={`text-[10px] mt-1 text-right ${
            message.isSentByMe ? "text-teal-100/70" : "text-gray-500"
          }`}
        >
          {time}
        </div>
      </div>
    </motion.div>
  );
}
