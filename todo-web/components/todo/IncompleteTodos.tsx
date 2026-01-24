import styles from '../TodoApp.module.css';
import type { Todo } from '@/lib/types';

type InCompleteTodoProps = {
  todos: Todo[],
  onClickComplete: (id: number) => void,
  onClickDelete: (id: number) => void,
}

export const IncompleteTodos = ({ todos, onClickComplete, onClickDelete }: InCompleteTodoProps) => {
  return (
    <div className={styles.incompleteArea}>
      <p className={styles.title}>未完了のTODO</p>
      <ul>
        {todos.map((todo) => (
          <li key={todo.id}>
            <div className={styles.listRow}>
              <p className={styles.todoItem}>{todo.title}</p>
              <button onClick={() => onClickComplete(todo.id)}>完了</button>
              <button onClick={() => onClickDelete(todo.id)}>削除</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
