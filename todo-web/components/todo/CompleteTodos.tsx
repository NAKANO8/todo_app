import styles from '../TodoApp.module.css';
import type { Todo } from '@/lib/types';

type CompleteTodoProps = {
  todos: Todo[],
  onClickBack: (id: number) => void,
};

export const CompleteTodos = ({ todos, onClickBack }: CompleteTodoProps) => {
  return (
    <div className={styles.completeArea} >
      <p className={styles.title}>完了のTODO</p>
      <ul>
        {todos.map((todo) => (
          <li key={todo.id}>
            <div className={styles.listRow}>
              <p className={styles.todoItem}>{todo.title}</p>
              <button onClick={() => onClickBack(todo.id)}>戻す</button>
            </div>
          </li>
        ))}
      </ul>
    </div >
  );
};
