import { Admin } from '../domain/admin.js';
import { storageReport, type StorageReport } from '../domain/storage.js';
import type { User } from '../domain/user.js';
import type { Dependencies } from './ports.js';

export type AdminService = ReturnType<typeof createAdminService>;

export function createAdminService({
  admins,
  storageGauge,
  storageLimit,
}: Dependencies) {
  return {
    /** The viewer as an admin; null for everyone else. */
    admit: (viewer: User): Admin | null => Admin.admit(viewer, admins),

    /** How full the database is, and with what. Only an admin may ask. */
    async storage(_admin: Admin): Promise<StorageReport> {
      return storageReport(await storageGauge.measure(), storageLimit);
    },
  };
}
