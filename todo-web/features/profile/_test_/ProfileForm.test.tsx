import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { toast } from "react-toastify";
import { fetchMe } from "@/lib/api/auth";
import { updateProfileName, changeProfilePassword } from "@/lib/api/profile";
import ProfileForm from "../ProfileForm";

// タスク4.3: プロフィール画面のUI(表示名の表示/変更カード + パスワード変更カード)。
// design.md "ProfileForm / lib/api/profile.ts" 参照。

vi.mock("@/lib/api/auth", () => ({
  fetchMe: vi.fn(),
}));

vi.mock("@/lib/api/profile", () => ({
  updateProfileName: vi.fn(),
  changeProfilePassword: vi.fn(),
}));

vi.mock("react-toastify", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const mockFetchMe = vi.mocked(fetchMe);
const mockUpdateProfileName = vi.mocked(updateProfileName);
const mockChangeProfilePassword = vi.mocked(changeProfilePassword);
const mockToastError = vi.mocked(toast.error);
const mockToastSuccess = vi.mocked(toast.success);

const currentUser = { id: 1, email: "member@example.com", role: "member" as const, name: "太郎" };

describe("ProfileForm", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchMe.mockResolvedValue(currentUser);
    mockUpdateProfileName.mockResolvedValue(undefined);
    mockChangeProfilePassword.mockResolvedValue({ invalidatedCount: 2 });
  });

  it("マウント時に取得したメールアドレスと表示名が表示される", async () => {
    render(<ProfileForm />);

    await waitFor(() => expect(screen.getByText("member@example.com")).toBeInTheDocument());
    expect(screen.getByDisplayValue("太郎")).toBeInTheDocument();
  });

  it("タスク一覧へ戻るリンクが表示され、/todosを指している", async () => {
    render(<ProfileForm />);

    const link = await screen.findByRole("link", { name: "タスク一覧へ戻る" });
    expect(link).toHaveAttribute("href", "/todos");
  });

  it("表示名を変更して更新ボタンを押すとupdateProfileNameが呼ばれ、成功トーストが表示される", async () => {
    const user = userEvent.setup();
    render(<ProfileForm />);
    await waitFor(() => expect(screen.getByDisplayValue("太郎")).toBeInTheDocument());

    const input = screen.getByDisplayValue("太郎");
    await user.clear(input);
    await user.type(input, "次郎");
    await user.click(screen.getByRole("button", { name: "更新" }));

    await waitFor(() => expect(mockUpdateProfileName).toHaveBeenCalledWith("次郎"));
    expect(mockToastSuccess).toHaveBeenCalled();
  });

  it("表示名が空の場合、更新ボタンを押してもAPIは呼ばれずエラーメッセージが表示される", async () => {
    const user = userEvent.setup();
    render(<ProfileForm />);
    await waitFor(() => expect(screen.getByDisplayValue("太郎")).toBeInTheDocument());

    const input = screen.getByDisplayValue("太郎");
    await user.clear(input);
    await user.click(screen.getByRole("button", { name: "更新" }));

    expect(mockUpdateProfileName).not.toHaveBeenCalled();
    expect(screen.getByText("表示名を入力してください!")).toBeInTheDocument();
  });

  it("表示名の更新に失敗した場合、エラートーストが表示される", async () => {
    const user = userEvent.setup();
    mockUpdateProfileName.mockRejectedValue(new Error("Failed to update profile name"));
    render(<ProfileForm />);
    await waitFor(() => expect(screen.getByDisplayValue("太郎")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "更新" }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
  });

  it("現在・新規・確認用パスワードを入力して変更ボタンを押すと、確認用を除いた2項目でchangeProfilePasswordが呼ばれる", async () => {
    const user = userEvent.setup();
    render(<ProfileForm />);
    await waitFor(() => expect(screen.getByDisplayValue("太郎")).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText("現在のパスワード"), "oldPass1");
    await user.type(screen.getByPlaceholderText("新しいパスワード"), "NewPass1");
    await user.type(screen.getByPlaceholderText("新しいパスワード(確認用)"), "NewPass1");
    await user.click(screen.getByRole("button", { name: "変更" }));

    await waitFor(() =>
      expect(mockChangeProfilePassword).toHaveBeenCalledWith("oldPass1", "NewPass1")
    );
  });

  it("パスワード変更成功時、他のセッションがログアウトされたことが分かるトーストが表示され、入力欄がクリアされる", async () => {
    const user = userEvent.setup();
    render(<ProfileForm />);
    await waitFor(() => expect(screen.getByDisplayValue("太郎")).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText("現在のパスワード"), "oldPass1");
    await user.type(screen.getByPlaceholderText("新しいパスワード"), "NewPass1");
    await user.type(screen.getByPlaceholderText("新しいパスワード(確認用)"), "NewPass1");
    await user.click(screen.getByRole("button", { name: "変更" }));

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
    const [message] = mockToastSuccess.mock.calls[0];
    expect(message).toEqual(expect.stringContaining("セッション"));
    expect(screen.getByPlaceholderText("現在のパスワード")).toHaveValue("");
    expect(screen.getByPlaceholderText("新しいパスワード")).toHaveValue("");
    expect(screen.getByPlaceholderText("新しいパスワード(確認用)")).toHaveValue("");
  });

  it("確認用パスワードが新しいパスワードと一致しない場合、APIは呼ばれずエラーメッセージが表示される", async () => {
    const user = userEvent.setup();
    render(<ProfileForm />);
    await waitFor(() => expect(screen.getByDisplayValue("太郎")).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText("現在のパスワード"), "oldPass1");
    await user.type(screen.getByPlaceholderText("新しいパスワード"), "NewPass1");
    await user.type(screen.getByPlaceholderText("新しいパスワード(確認用)"), "Mismatch1");
    await user.click(screen.getByRole("button", { name: "変更" }));

    expect(mockChangeProfilePassword).not.toHaveBeenCalled();
    expect(screen.getByText("新しいパスワードが一致しません")).toBeInTheDocument();
  });

  it("新しいパスワードがパスワード強度要件を満たさない場合、APIは呼ばれずエラーメッセージが表示される", async () => {
    const user = userEvent.setup();
    render(<ProfileForm />);
    await waitFor(() => expect(screen.getByDisplayValue("太郎")).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText("現在のパスワード"), "oldPass1");
    await user.type(screen.getByPlaceholderText("新しいパスワード"), "weak");
    await user.type(screen.getByPlaceholderText("新しいパスワード(確認用)"), "weak");
    await user.click(screen.getByRole("button", { name: "変更" }));

    expect(mockChangeProfilePassword).not.toHaveBeenCalled();
    expect(screen.getByText("8文字以上・大文字1つ・数字1つ以上が必要です")).toBeInTheDocument();
  });

  it("パスワード変更に失敗した場合、エラートーストが表示される", async () => {
    const user = userEvent.setup();
    mockChangeProfilePassword.mockRejectedValue(new Error("current password does not match"));
    render(<ProfileForm />);
    await waitFor(() => expect(screen.getByDisplayValue("太郎")).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText("現在のパスワード"), "wrongPass");
    await user.type(screen.getByPlaceholderText("新しいパスワード"), "NewPass1");
    await user.type(screen.getByPlaceholderText("新しいパスワード(確認用)"), "NewPass1");
    await user.click(screen.getByRole("button", { name: "変更" }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
  });

  it("パスワード変更が429(レート制限)で失敗した場合、他のエラーと区別できるトーストが表示される", async () => {
    const user = userEvent.setup();
    const rateLimitError = new Error("Failed to change password") as Error & { status?: number };
    rateLimitError.status = 429;
    mockChangeProfilePassword.mockRejectedValue(rateLimitError);
    render(<ProfileForm />);
    await waitFor(() => expect(screen.getByDisplayValue("太郎")).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText("現在のパスワード"), "oldPass1");
    await user.type(screen.getByPlaceholderText("新しいパスワード"), "NewPass1");
    await user.type(screen.getByPlaceholderText("新しいパスワード(確認用)"), "NewPass1");
    await user.click(screen.getByRole("button", { name: "変更" }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    const [rateLimitMessage] = mockToastError.mock.calls[0];

    mockToastError.mockClear();
    mockChangeProfilePassword.mockRejectedValue(new Error("current password does not match"));
    await user.type(screen.getByPlaceholderText("現在のパスワード"), "wrongPass");
    await user.click(screen.getByRole("button", { name: "変更" }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    const [genericMessage] = mockToastError.mock.calls[0];

    expect(rateLimitMessage).not.toEqual(genericMessage);
    expect(rateLimitMessage).toEqual(expect.stringContaining("しばらく待ってから再試行してください"));
  });
});
