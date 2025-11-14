import { formatTime } from '../../../lib/utils/time';

interface MessageBubbleProps {
  message: {
    id: string;
    content: string;
    sender: {
      id: string;
      name: string;
    };
    createdAt: string;
  };
  isCurrentUser: boolean;
}

export function MessageBubble({ message, isCurrentUser }: MessageBubbleProps) {
  return (
    <div
      className={`flex mb-4 ${isCurrentUser ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[70%] px-4 py-3 rounded-xl shadow-sm ${
          isCurrentUser
            ? 'bg-blue-500 text-white'
            : 'bg-white text-gray-800'
        }`}
      >
        {!isCurrentUser && (
          <div className="text-xs font-bold mb-1 opacity-80">
            {message.sender.name}
          </div>
        )}
        <div className="text-[15px] break-words">{message.content}</div>
        <div className="text-[11px] mt-1 opacity-70 text-right">
          {formatTime(message.createdAt)}
        </div>
      </div>
    </div>
  );
}
