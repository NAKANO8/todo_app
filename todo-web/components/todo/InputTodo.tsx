type InputTodoProps = {
  todoText: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClick: () => void;
  disabled: boolean;
};

export const InputTodo = (props: InputTodoProps) => {
  const { todoText, onChange, onClick, disabled } = props;

  return (
    <div className="flex items-center bg-teal-100 w-[400px] h-[30px] p-2 m-2 rounded-lg">
      <input
        disabled={disabled}
        placeholder="Todoを入力"
        value={todoText}
        onChange={onChange}
        className="flex-1 mr-2 px-4 py-1 rounded-lg outline-none disabled:bg-gray-200"
      />
      <button
        disabled={disabled}
        onClick={onClick}
        className="px-4 py-1 rounded-lg bg-white hover:bg-teal-400 hover:text-white disabled:bg-gray-300 disabled:text-gray-500"
      >
        追加
      </button>
    </div>
  );
};
