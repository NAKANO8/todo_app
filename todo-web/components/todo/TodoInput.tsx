type TodoInputProps = {
  inputValue: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAdd: () => void;
  disabled: boolean;
};

export const TodoInput = ({ inputValue, onChange, onAdd, disabled }: TodoInputProps) => {
  return (
    <div className="flex items-center gap-2 w-full">
      <input
        disabled={disabled}
        placeholder="Todoを入力"
        value={inputValue}
        onChange={onChange}
        className="flex-1 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400 disabled:bg-gray-100 disabled:text-gray-400"
      />
      <button
        disabled={disabled}
        onClick={onAdd}
        className="px-4 py-2 rounded-lg text-sm font-medium bg-[#2f6f5e] text-white hover:bg-[#245a4b] disabled:bg-gray-200 disabled:text-gray-400 cursor-pointer disabled:cursor-not-allowed"
      >
        追加
      </button>
    </div>
  );
};
