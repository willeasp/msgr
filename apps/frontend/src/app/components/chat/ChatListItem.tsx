import { formatTime } from '../../../lib/utils/time';

interface ChatListItemProps {
  chat: {
    id: string;
    title: string;
    messages: Array<{
      id: string;
      content: string;
      createdAt: string;
    }>;
  };
  isSelected: boolean;
  onSelect: () => void;
}

export function ChatListItem({
  chat,
  isSelected,
  onSelect,
}: ChatListItemProps) {
  const latestMessage = chat.messages[0];

  return (
    <div
      onClick={onSelect}
      className={`p-4 border-b border-gray-200 cursor-pointer transition-colors ${
        isSelected ? 'bg-blue-50' : 'bg-white hover:bg-gray-50'
      }`}
    >
      <div className="font-bold text-base mb-1 text-gray-800">
        {chat.title}
      </div>
      {latestMessage && (
        <>
          <div className="text-sm text-gray-600 overflow-hidden text-ellipsis whitespace-nowrap mb-1">
            {latestMessage.content}
          </div>
          <div className="text-xs text-gray-400">
            {formatTime(latestMessage.createdAt)}
          </div>
        </>
      )}
    </div>
  );
}
