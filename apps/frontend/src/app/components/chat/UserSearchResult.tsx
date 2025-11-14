interface UserSearchResultProps {
  user: {
    id: string;
    name: string;
    email: string;
  };
  onSelect: () => void;
}

export function UserSearchResult({ user, onSelect }: UserSearchResultProps) {
  return (
    <div
      onClick={onSelect}
      className="p-3 border border-gray-200 rounded-lg mb-2 cursor-pointer transition-colors hover:bg-blue-50"
    >
      <div className="font-semibold text-base">{user.name}</div>
      <div className="text-sm text-gray-500">{user.email}</div>
    </div>
  );
}
