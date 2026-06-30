import type { Todo } from '@/lib/types';

type ActiveTodosProps = {
  todos: Todo[];
  onComplete: (id: number) => void;
  onDelete: (id: number) => void;
};

export const ActiveTodos = ({ todos, onComplete, onDelete }: ActiveTodosProps) => {
  if (todos.length === 0) return null;

  return (
    <section>
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
        未完了 <span className="text-gray-300">({todos.length})</span>
      </h2>
      <ul className="flex flex-col gap-1.5">
        {todos.map((todo) => (
          <li key={todo.id} className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-white border border-gray-100 shadow-sm">
            <span className="flex-1 text-sm text-[#1c2024]">{todo.title}</span>
            <button
              onClick={() => onComplete(todo.id)}
              className="text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-md px-2.5 py-1 border border-teal-100 cursor-pointer"
            >
              完了
            </button>
            <button
              onClick={() => onDelete(todo.id)}
              className="text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 rounded-md px-2.5 py-1 border border-red-100 cursor-pointer"
            >
              削除
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};
