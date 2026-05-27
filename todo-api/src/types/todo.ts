export type Todo = {
  id: number;
  user_id: number;
  title: string;
  status: number;
  created_at: string;
  updated_at: string;
};

export type LoginBody = {
  email: string;
  password: string;
};
