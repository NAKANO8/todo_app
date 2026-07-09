import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { toast } from "react-toastify";
import { fetchUsers, updateUserRole, updateUserStatus } from "@/lib/api/adminUsers";
import AdminUserList from "../AdminUserList";
import type { User } from "@/lib/types";

vi.mock("@/lib/api/adminUsers", () => ({
  fetchUsers: vi.fn(),
  updateUserRole: vi.fn(),
  updateUserStatus: vi.fn(),
}));

vi.mock("react-toastify", () => ({
  toast: { error: vi.fn() },
}));

const mockFetchUsers = vi.mocked(fetchUsers);
const mockUpdateUserRole = vi.mocked(updateUserRole);
const mockUpdateUserStatus = vi.mocked(updateUserStatus);
const mockToastError = vi.mocked(toast.error);

const adminActive: User = {
  id: 1,
  email: "admin@example.com",
  role: "admin",
  status: "active",
};

const memberDisabled: User = {
  id: 2,
  email: "member@example.com",
  role: "member",
  status: "disabled",
};

describe("AdminUserList", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchUsers.mockResolvedValue([adminActive, memberDisabled]);
    mockUpdateUserRole.mockResolvedValue(undefined);
    mockUpdateUserStatus.mockResolvedValue({ invalidatedCount: 0 });
  });

  it("マウント時に取得した各ユーザーのメール・ロール・状態が一覧に表示される", async () => {
    render(<AdminUserList />);

    await waitFor(() => expect(screen.getByText("admin@example.com")).toBeInTheDocument());
    expect(screen.getByText("member@example.com")).toBeInTheDocument();
    expect(screen.getByText("管理者")).toBeInTheDocument();
    expect(screen.getByText("一般ユーザー")).toBeInTheDocument();
    expect(screen.getByText("有効")).toBeInTheDocument();
    expect(screen.getByText("無効")).toBeInTheDocument();
  });

  it("一覧取得に失敗した場合、トーストでエラーが表示されクラッシュしない", async () => {
    mockFetchUsers.mockReset().mockRejectedValue(new Error("Failed to fetch users"));

    render(<AdminUserList />);

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(screen.queryByText("admin@example.com")).not.toBeInTheDocument();
  });

  it.each([
    { rowUser: adminActive, buttonName: "一般ユーザーにする", expectedRole: "member" as const },
    { rowUser: memberDisabled, buttonName: "管理者にする", expectedRole: "admin" as const },
  ])(
    "$rowUser.email 行の「$buttonName」をクリックするとロール変更が呼ばれ、一覧が更新後の状態を反映する",
    async ({ rowUser, buttonName, expectedRole }) => {
      const user = userEvent.setup();
      const updated: User = { ...rowUser, role: expectedRole };
      mockFetchUsers.mockResolvedValueOnce([adminActive, memberDisabled]).mockResolvedValueOnce(
        [adminActive, memberDisabled].map((u) => (u.id === rowUser.id ? updated : u))
      );

      render(<AdminUserList />);
      await waitFor(() => expect(screen.getByText(rowUser.email)).toBeInTheDocument());

      await user.click(screen.getByRole("button", { name: buttonName }));

      expect(mockUpdateUserRole).toHaveBeenCalledWith(rowUser.id, expectedRole);
      await waitFor(() => expect(mockFetchUsers).toHaveBeenCalledTimes(2));
    }
  );

  it.each([
    { rowUser: adminActive, buttonName: "無効化", expectedStatus: "disabled" as const },
    { rowUser: memberDisabled, buttonName: "再有効化", expectedStatus: "active" as const },
  ])(
    "$rowUser.email 行の「$buttonName」をクリックすると状態変更が呼ばれ、一覧が更新後の状態を反映する",
    async ({ rowUser, buttonName, expectedStatus }) => {
      const user = userEvent.setup();
      const updated: User = { ...rowUser, status: expectedStatus };
      mockFetchUsers.mockResolvedValueOnce([adminActive, memberDisabled]).mockResolvedValueOnce(
        [adminActive, memberDisabled].map((u) => (u.id === rowUser.id ? updated : u))
      );

      render(<AdminUserList />);
      await waitFor(() => expect(screen.getByText(rowUser.email)).toBeInTheDocument());

      await user.click(screen.getByRole("button", { name: buttonName }));

      expect(mockUpdateUserStatus).toHaveBeenCalledWith(rowUser.id, expectedStatus);
      await waitFor(() => expect(mockFetchUsers).toHaveBeenCalledTimes(2));
    }
  );

  it.each([
    {
      action: "ロール変更" as const,
      buttonName: "一般ユーザーにする",
      setup: () => mockUpdateUserRole.mockRejectedValue(new Error("Failed to update user role")),
    },
    {
      action: "状態変更" as const,
      buttonName: "無効化",
      setup: () => mockUpdateUserStatus.mockRejectedValue(new Error("Failed to update user status")),
    },
  ])(
    "$action が失敗した場合、トーストでエラーが表示され一覧は変更前の状態のまま残る",
    async ({ buttonName, setup }) => {
      const user = userEvent.setup();
      setup();

      render(<AdminUserList />);
      await waitFor(() => expect(screen.getByText(adminActive.email)).toBeInTheDocument());

      await user.click(screen.getByRole("button", { name: buttonName }));

      await waitFor(() => expect(mockToastError).toHaveBeenCalled());
      expect(screen.getByText(adminActive.email)).toBeInTheDocument();
      expect(screen.getByText("管理者")).toBeInTheDocument();
      expect(screen.getByText("有効")).toBeInTheDocument();
    }
  );
});
