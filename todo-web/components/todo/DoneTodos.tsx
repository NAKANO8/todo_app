import type { Todo } from '@/lib/types';

type DoneTodosProps = {
  todos: Todo[];
  onRestore: (id: number) => void;
};

export const DoneTodos = ({ todos, onRestore }: DoneTodosProps) => {
  if (todos.length === 0) return null;

  return (
    <section>
      <div className="border-t border-gray-200 my-1" />
      <h2 className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2 mt-3">
        完了済み <span>({todos.length})</span>
      </h2>
      <ul className="flex flex-col gap-1.5">
        {todos.map((todo) => (
          <li key={todo.id} className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-gray-50">
            <span className="flex-1 text-sm text-gray-400 line-through">{todo.title}</span>
            <button
              onClick={() => onRestore(todo.id)}
              className="text-xs font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-md px-2.5 py-1 cursor-pointer"
            >
              戻す
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};
