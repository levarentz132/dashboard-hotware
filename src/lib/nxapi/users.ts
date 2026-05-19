import { NxServerService } from "./servers";

export class NxUserService extends NxServerService {
  // User methods
  async getUsers(): Promise<any[]> {
    const users = await this.apiRequest<any[]>("/users");
    return Array.isArray(users) ? users : [];
  }

  async getUserById(id: string): Promise<any> {
    const normalizedId = id.replace(/[{}]/g, "");
    return await this.apiRequest<any>(`/users/${normalizedId}`);
  }

  async getCurrentSession(): Promise<{ username: string; token: string } | null> {
    try {
      return await this.apiRequest<any>("/rest/v3/login/sessions/-", { skipCache: true });
    } catch (error) {
      console.warn("[nxAPI] Failed to fetch current session info:", error);
      return null;
    }
  }

  async getUserPermissions(): Promise<{ permissions: string; resourceAccessRights: Record<string, string> } | null> {
    try {
      return await this.apiRequest<any>("/users/-/permissions", { skipCache: true });
    } catch (error) {
      console.warn("[nxAPI] Failed to fetch current user permissions:", error);
      return null;
    }
  }

  async createUser(userData: any): Promise<any> {
    const normalizedData = { ...userData };
    if (Array.isArray(normalizedData.groupIds)) {
      normalizedData.groupIds = normalizedData.groupIds.map((id: string) => id.replace(/[{}]/g, ""));
    }
    return await this.apiRequest<any>("/users", {
      method: "POST",
      body: JSON.stringify(normalizedData),
    });
  }

  async updateUser(id: string, userData: any): Promise<any> {
    const normalizedId = id.replace(/[{}]/g, "");
    const normalizedData = { ...userData };
    if (Array.isArray(normalizedData.groupIds)) {
      normalizedData.groupIds = normalizedData.groupIds.map((gid: string) => gid.replace(/[{}]/g, ""));
    }
    return await this.apiRequest<any>(`/users/${normalizedId}`, {
      method: "PATCH",
      body: JSON.stringify(normalizedData),
    });
  }

  async deleteUser(id: string): Promise<boolean> {
    const normalizedId = id.replace(/[{}]/g, "");
    await this.apiRequest<any>(`/users/${normalizedId}`, {
      method: "DELETE",
    });
    return true;
  }

  // User Group methods
  async getUserGroups(): Promise<any[]> {
    const groups = await this.apiRequest<any[]>("/userGroups");
    return Array.isArray(groups) ? groups : [];
  }
}
