import TodoApp from "../features/todo/TodoApp"
import LoginForm from "./login/page"

export default function Page() {
  const isLoggedIn = false; //ここをcookieやセッションで成功したか見ないといけない

  if(isLoggedIn) {
    return <TodoApp />
  } else {
    return <LoginForm />
  }
}

