import fs from 'fs';
import path from 'path';
import { ensureDir, formatDate, getDirSize } from '../../utils';
import { config } from '../../config';
import type { PackageInfo, PackageVersion, CacheStats, StorageTrend, CachePolicy, RegistryType, PackageSource, ScopeStats, LargestPackage, RegistryBreakdown, StorageSnapshot } from '../../types';

interface DBPackage {
  id: number;
  name: string;
  registry: RegistryType;
  source: PackageSource;
  scope?: string;
  description?: string;
  author?: string;
  license?: string;
  latestVersion: string;
  createdAt: number;
  updatedAt: number;
  totalSize: number;
  downloadCount: number;
}

interface DBVersion {
  id: number;
  packageId: number;
  version: string;
  size: number;
  filePath: string;
  sha1?: string;
  publishedAt: number;
  downloadCount: number;
}

interface DB {
  nextPackageId: number;
  nextVersionId: number;
  packages: DBPackage[];
  versions: DBVersion[];
  storageTrend: StorageTrend[];
  cachePolicy: CachePolicy;
  storageSnapshots: StorageSnapshot[];
}

const DEFAULT_POLICY: CachePolicy = {
  maxSizeGB: 50,
  maxAgeDays: 90,
  autoClean: true,
};

export class MetadataIndex {
  private dataDir: string;
  private dbPath: string;
  private db: DB;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    ensureDir(dataDir);
    this.dbPath = path.join(dataDir, 'registry-data.json');
    this.db = this.loadDB();
  }

  private loadDB(): DB {
    if (fs.existsSync(this.dbPath)) {
      try {
        const raw = fs.readFileSync(this.dbPath, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          nextPackageId: parsed.nextPackageId || 1,
          nextVersionId: parsed.nextVersionId || 1,
          packages: parsed.packages || [],
          versions: parsed.versions || [],
          storageTrend: parsed.storageTrend || [],
          cachePolicy: parsed.cachePolicy || { ...DEFAULT_POLICY, ...config.cache },
          storageSnapshots: parsed.storageSnapshots || [],
        };
      } catch {
        // fall through to default
      }
    }
    return {
      nextPackageId: 1,
      nextVersionId: 1,
      packages: [],
      versions: [],
      storageTrend: [],
      cachePolicy: { ...DEFAULT_POLICY, ...config.cache },
      storageSnapshots: [],
    };
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.persist();
    }, 200);
  }

  private persist(): void {
    ensureDir(this.dataDir);
    const tmpPath = this.dbPath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(this.db, null, 2), 'utf-8');
    fs.renameSync(tmpPath, this.dbPath);
  }

  getOrCreatePackage(
    name: string,
    registry: RegistryType,
    source: PackageSource,
    scope?: string
  ): number {
    const existing = this.db.packages.find(
      (p) => p.name === name && p.registry === registry
    );
    if (existing) return existing.id;

    const now = Date.now();
    const id = this.db.nextPackageId++;
    this.db.packages.push({
      id,
      name,
      registry,
      source,
      scope,
      latestVersion: '',
      createdAt: now,
      updatedAt: now,
      totalSize: 0,
      downloadCount: 0,
    });
    this.scheduleSave();
    return id;
  }

  upsertPackageInfo(info: Partial<PackageInfo> & { name: string; registry: RegistryType }): void {
    const existing = this.db.packages.find(
      (p) => p.name === info.name && p.registry === info.registry
    );
    const now = Date.now();

    if (existing) {
      if (info.description !== undefined) existing.description = info.description;
      if (info.author !== undefined) existing.author = info.author;
      if (info.license !== undefined) existing.license = info.license;
      if (info.latestVersion !== undefined) existing.latestVersion = info.latestVersion;
      if (info.source !== undefined) existing.source = info.source;
      existing.updatedAt = now;
    } else {
      this.getOrCreatePackage(info.name, info.registry, info.source || 'cache', info.scope);
    }
    this.scheduleSave();
  }

  addVersion(
    packageId: number,
    version: string,
    size: number,
    filePath: string,
    sha1?: string
  ): void {
    const now = Date.now();
    const existing = this.db.versions.find(
      (v) => v.packageId === packageId && v.version === version
    );
    if (existing) {
      existing.size = size;
      existing.filePath = filePath;
      if (sha1) existing.sha1 = sha1;
      existing.publishedAt = now;
    } else {
      const id = this.db.nextVersionId++;
      this.db.versions.push({
        id,
        packageId,
        version,
        size,
        filePath,
        sha1,
        publishedAt: now,
        downloadCount: 0,
      });
    }
    this.recalcPackageSize(packageId);
    const pkg = this.db.packages.find((p) => p.id === packageId);
    if (pkg) pkg.updatedAt = now;
    this.scheduleSave();
  }

  private recalcPackageSize(packageId: number): void {
    const pkgVersions = this.db.versions.filter((v) => v.packageId === packageId);
    const total = pkgVersions.reduce((s, v) => s + v.size, 0);
    const latest = pkgVersions.sort((a, b) => b.publishedAt - a.publishedAt)[0];

    const pkg = this.db.packages.find((p) => p.id === packageId);
    if (pkg) {
      pkg.totalSize = total;
      pkg.latestVersion = latest?.version || '';
    }
  }

  incrementVersionDownload(packageId: number, version: string): void {
    const v = this.db.versions.find(
      (v) => v.packageId === packageId && v.version === version
    );
    if (v) v.downloadCount++;
    const pkg = this.db.packages.find((p) => p.id === packageId);
    if (pkg) pkg.downloadCount++;
    this.scheduleSave();
  }

  getPackage(name: string, registry: RegistryType): PackageInfo | null {
    const pkg = this.db.packages.find(
      (p) => p.name === name && p.registry === registry
    );
    if (!pkg) return null;

    const versions = this.db.versions
      .filter((v) => v.packageId === pkg.id)
      .sort((a, b) => b.publishedAt - a.publishedAt)
      .map<PackageVersion>((v) => ({
        version: v.version,
        size: v.size,
        filePath: v.filePath,
        sha1: v.sha1,
        publishedAt: v.publishedAt,
        downloadCount: v.downloadCount,
      }));

    return {
      name: pkg.name,
      registry: pkg.registry,
      source: pkg.source,
      scope: pkg.scope,
      description: pkg.description,
      author: pkg.author,
      license: pkg.license,
      latestVersion: pkg.latestVersion,
      createdAt: pkg.createdAt,
      updatedAt: pkg.updatedAt,
      totalSize: pkg.totalSize,
      downloadCount: pkg.downloadCount,
      versions,
    };
  }

  listPackages(options: {
    registry?: RegistryType;
    source?: PackageSource;
    search?: string;
    limit?: number;
    offset?: number;
    sortBy?: 'name' | 'updatedAt' | 'size' | 'downloads';
    sortOrder?: 'asc' | 'desc';
  } = {}): { packages: PackageInfo[]; total: number } {
    let list = [...this.db.packages];

    if (options.registry) list = list.filter((p) => p.registry === options.registry);
    if (options.source) list = list.filter((p) => p.source === options.source);
    if (options.search) {
      const s = options.search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(s));
    }

    const total = list.length;

    const sortField = options.sortBy === 'size' ? 'totalSize' :
      options.sortBy === 'downloads' ? 'downloadCount' :
      options.sortBy === 'updatedAt' ? 'updatedAt' : 'name';
    const order = options.sortOrder?.toUpperCase() === 'ASC' ? 1 : -1;

    list.sort((a: any, b: any) => {
      const va = a[sortField];
      const vb = b[sortField];
      if (typeof va === 'string') return va.localeCompare(vb) * order;
      return (va - vb) * order;
    });

    const limit = options.limit || 50;
    const offset = options.offset || 0;
    list = list.slice(offset, offset + limit);

    const idSet = new Set(list.map((p) => p.id));
    const versionsByPkg: Record<number, DBVersion[]> = {};
    for (const v of this.db.versions) {
      if (idSet.has(v.packageId)) {
        if (!versionsByPkg[v.packageId]) versionsByPkg[v.packageId] = [];
        versionsByPkg[v.packageId].push(v);
      }
    }
    for (const arr of Object.values(versionsByPkg)) {
      arr.sort((a, b) => b.publishedAt - a.publishedAt);
    }

    const packages: PackageInfo[] = list.map((pkg) => ({
      name: pkg.name,
      registry: pkg.registry,
      source: pkg.source,
      scope: pkg.scope,
      description: pkg.description,
      author: pkg.author,
      license: pkg.license,
      latestVersion: pkg.latestVersion,
      createdAt: pkg.createdAt,
      updatedAt: pkg.updatedAt,
      totalSize: pkg.totalSize,
      downloadCount: pkg.downloadCount,
      versions: (versionsByPkg[pkg.id] || []).map<PackageVersion>((v) => ({
        version: v.version,
        size: v.size,
        filePath: v.filePath,
        sha1: v.sha1,
        publishedAt: v.publishedAt,
        downloadCount: v.downloadCount,
      })),
    }));

    return { packages, total };
  }

  getVersionFilePath(packageName: string, registry: RegistryType, version: string): string | null {
    const pkg = this.db.packages.find(
      (p) => p.name === packageName && p.registry === registry
    );
    if (!pkg) return null;
    const ver = this.db.versions.find(
      (v) => v.packageId === pkg.id && v.version === version
    );
    return ver?.filePath || null;
  }

  deletePackage(name: string, registry: RegistryType): boolean {
    const idx = this.db.packages.findIndex(
      (p) => p.name === name && p.registry === registry
    );
    if (idx < 0) return false;
    const [pkg] = this.db.packages.splice(idx, 1);
    this.db.versions = this.db.versions.filter((v) => v.packageId !== pkg.id);
    this.scheduleSave();
    return true;
  }

  deletePackageVersion(name: string, registry: RegistryType, version: string): boolean {
    const pkg = this.db.packages.find(
      (p) => p.name === name && p.registry === registry
    );
    if (!pkg) return false;

    const idx = this.db.versions.findIndex(
      (v) => v.packageId === pkg.id && v.version === version
    );
    if (idx < 0) return false;

    this.db.versions.splice(idx, 1);
    this.recalcPackageSize(pkg.id);
    this.scheduleSave();
    return true;
  }

  getStats(): CacheStats {
    const totalPackages = this.db.packages.length;
    const totalVersions = this.db.versions.length;
    const totalSize = this.db.packages.reduce((s, p) => s + p.totalSize, 0);
    const npmPackages = this.db.packages.filter((p) => p.registry === 'npm').length;
    const pypiPackages = this.db.packages.filter((p) => p.registry === 'pypi').length;
    const privatePackages = this.db.packages.filter((p) => p.source === 'private').length;
    const cachePackages = this.db.packages.filter((p) => p.source === 'cache').length;

    const npmSize = this.db.packages.filter((p) => p.registry === 'npm').reduce((s, p) => s + p.totalSize, 0);
    const pypiSize = this.db.packages.filter((p) => p.registry === 'pypi').reduce((s, p) => s + p.totalSize, 0);
    const privateSize = this.db.packages.filter((p) => p.source === 'private').reduce((s, p) => s + p.totalSize, 0);
    const cacheSize = this.db.packages.filter((p) => p.source === 'cache').reduce((s, p) => s + p.totalSize, 0);

    const policy = this.getCachePolicy();
    const maxSizeBytes = policy.maxSizeGB * 1024 * 1024 * 1024;
    const dirSize = getDirSize(config.storageDir);
    const actualSize = Math.max(totalSize, dirSize);

    const pkgVersionCounts: Record<number, number> = {};
    for (const v of this.db.versions) {
      pkgVersionCounts[v.packageId] = (pkgVersionCounts[v.packageId] || 0) + 1;
    }

    const largestPackages = [...this.db.packages]
      .sort((a, b) => b.totalSize - a.totalSize)
      .slice(0, 10)
      .map((p) => ({
        name: p.name,
        registry: p.registry,
        size: p.totalSize,
        versions: pkgVersionCounts[p.id] || 0,
        growth: this.calculatePackageGrowth(p.id, 7),
      }));

    const recentGrowth = this.calculateRecentGrowth(30);

    return {
      totalPackages,
      totalVersions,
      totalSize: actualSize,
      npmPackages,
      pypiPackages,
      privatePackages,
      cachePackages,
      maxSize: maxSizeBytes,
      usagePercent: actualSize > 0 && maxSizeBytes > 0 ? Math.min(100, (actualSize / maxSizeBytes) * 100) : 0,
      npmSize,
      pypiSize,
      privateSize,
      cacheSize,
      largestPackages,
      recentGrowth,
    };
  }

  private calculatePackageGrowth(packageId: number, days: number): number {
    const pkg = this.db.packages.find((p) => p.id === packageId);
    if (!pkg) return 0;

    const now = Date.now();
    const cutoff = now - days * 24 * 60 * 60 * 1000;
    const recentVersions = this.db.versions.filter(
      (v) => v.packageId === packageId && v.publishedAt >= cutoff
    );
    const recentSize = recentVersions.reduce((s, v) => s + v.size, 0);

    if (pkg.totalSize === 0) return 0;
    return Math.round((recentSize / pkg.totalSize) * 100);
  }

  private calculateRecentGrowth(days: number): Array<{ date: string; growth: number }> {
    const trend = this.db.storageTrend.slice(-days);
    if (trend.length < 2) return [];

    const result: Array<{ date: string; growth: number }> = [];
    for (let i = 1; i < trend.length; i++) {
      const prev = trend[i - 1];
      const curr = trend[i];
      const growth = prev.size > 0 ? ((curr.size - prev.size) / prev.size) * 100 : 0;
      result.push({
        date: curr.date,
        growth: Math.round(growth * 100) / 100,
      });
    }
    return result;
  }

  getRegistryBreakdown(): RegistryBreakdown[] {
    const totalSize = this.db.packages.reduce((s, p) => s + p.totalSize, 0);
    const registries: RegistryType[] = ['npm', 'pypi'];

    return registries.map((registry) => {
      const pkgs = this.db.packages.filter((p) => p.registry === registry);
      const versions = this.db.versions.filter((v) => {
        const pkg = this.db.packages.find((p) => p.id === v.packageId);
        return pkg?.registry === registry;
      });
      const size = pkgs.reduce((s, p) => s + p.totalSize, 0);

      return {
        registry,
        packages: pkgs.length,
        versions: versions.length,
        size,
        percent: totalSize > 0 ? Math.round((size / totalSize) * 10000) / 100 : 0,
      };
    });
  }

  getStatsByScope(): ScopeStats[] {
    const scopeMap = new Map<string, { packages: number; size: number }>();
    const totalSize = this.db.packages.reduce((s, p) => s + p.totalSize, 0);

    for (const pkg of this.db.packages) {
      const scope = pkg.scope || (pkg.registry === 'npm' ? 'npm-global' : 'pypi-global');
      const existing = scopeMap.get(scope) || { packages: 0, size: 0 };
      scopeMap.set(scope, {
        packages: existing.packages + 1,
        size: existing.size + pkg.totalSize,
      });
    }

    const result: ScopeStats[] = [];
    for (const [scope, data] of scopeMap.entries()) {
      result.push({
        scope,
        packages: data.packages,
        size: data.size,
        percent: totalSize > 0 ? Math.round((data.size / totalSize) * 10000) / 100 : 0,
      });
    }

    return result.sort((a, b) => b.size - a.size);
  }

  getLargestPackages(limit: number = 20): LargestPackage[] {
    const pkgVersionCounts: Record<number, number> = {};
    for (const v of this.db.versions) {
      pkgVersionCounts[v.packageId] = (pkgVersionCounts[v.packageId] || 0) + 1;
    }

    return [...this.db.packages]
      .sort((a, b) => b.totalSize - a.totalSize)
      .slice(0, limit)
      .map((p, idx) => ({
        name: p.name,
        registry: p.registry,
        source: p.source,
        scope: p.scope,
        size: p.totalSize,
        versions: pkgVersionCounts[p.id] || 0,
        latestVersion: p.latestVersion,
        updatedAt: p.updatedAt,
        growth7d: this.calculatePackageGrowth(p.id, 7),
        sizeRank: idx + 1,
      }));
  }

  getStorageTrend(days: number = 30): StorageTrend[] {
    return this.db.storageTrend.slice(-days);
  }

  recordStorageSnapshot(): void {
    const stats = this.getStats();
    const date = formatDate(Date.now());
    const idx = this.db.storageTrend.findIndex((t) => t.date === date);
    const entry: StorageTrend = {
      date,
      size: stats.totalSize,
      packages: stats.totalPackages,
      npmSize: stats.npmSize,
      pypiSize: stats.pypiSize,
      privateSize: stats.privateSize,
      cacheSize: stats.cacheSize,
    };
    if (idx >= 0) {
      this.db.storageTrend[idx] = entry;
    } else {
      this.db.storageTrend.push(entry);
    }
    if (this.db.storageTrend.length > 365) {
      this.db.storageTrend = this.db.storageTrend.slice(-365);
    }

    const byScope: Record<string, number> = {};
    for (const pkg of this.db.packages) {
      const scope = pkg.scope || (pkg.registry === 'npm' ? 'npm-global' : 'pypi-global');
      byScope[scope] = (byScope[scope] || 0) + pkg.totalSize;
    }

    const snapshot: StorageSnapshot = {
      timestamp: Date.now(),
      totalSize: stats.totalSize,
      npmSize: stats.npmSize,
      pypiSize: stats.pypiSize,
      privateSize: stats.privateSize,
      byScope,
    };
    this.db.storageSnapshots.push(snapshot);
    if (this.db.storageSnapshots.length > 365) {
      this.db.storageSnapshots = this.db.storageSnapshots.slice(-365);
    }

    this.scheduleSave();
  }

  getStorageTrendByRange(startDate?: string, endDate?: string, days?: number): StorageTrend[] {
    let trend = [...this.db.storageTrend];

    if (startDate) {
      trend = trend.filter((t) => t.date >= startDate);
    }
    if (endDate) {
      trend = trend.filter((t) => t.date <= endDate);
    }
    if (days && !startDate && !endDate) {
      trend = trend.slice(-days);
    }

    return trend;
  }

  getCachePolicy(): CachePolicy {
    return { ...this.db.cachePolicy };
  }

  updateCachePolicy(policy: CachePolicy): void {
    this.db.cachePolicy = { ...policy };
    this.scheduleSave();
  }

  getOldPackages(maxAgeDays: number): Array<{ name: string; registry: RegistryType; filePath: string }> {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    const pkgMap = new Map(this.db.packages.map((p) => [p.id, p]));
    const result: Array<{ name: string; registry: RegistryType; filePath: string }> = [];
    for (const v of this.db.versions) {
      const pkg = pkgMap.get(v.packageId);
      if (pkg && pkg.updatedAt < cutoff && pkg.source === 'cache') {
        result.push({ name: pkg.name, registry: pkg.registry, filePath: v.filePath });
      }
    }
    return result;
  }

  getPackagesForEviction(neededBytes: number): Array<{ name: string; registry: RegistryType; version: string; filePath: string; size: number }> {
    const pkgMap = new Map(this.db.packages.map((p) => [p.id, p]));
    const rows = this.db.versions
      .map((v) => {
        const pkg = pkgMap.get(v.packageId)!;
        return {
          name: pkg.name,
          registry: pkg.registry,
          version: v.version,
          filePath: v.filePath,
          size: v.size,
          _downloads: pkg.downloadCount,
          _updated: pkg.updatedAt,
          _isCache: pkg.source === 'cache',
        };
      })
      .filter((r) => r._isCache)
      .sort((a, b) => a._downloads - b._downloads || a._updated - b._updated);

    const result: Array<{ name: string; registry: RegistryType; version: string; filePath: string; size: number }> = [];
    let acc = 0;
    for (const r of rows) {
      result.push({
        name: r.name,
        registry: r.registry,
        version: r.version,
        filePath: r.filePath,
        size: r.size,
      });
      acc += r.size;
      if (acc >= neededBytes) break;
    }
    return result;
  }

  close(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.persist();
  }
}

let metadataInstance: MetadataIndex | null = null;

export function getMetadataIndex(): MetadataIndex {
  if (!metadataInstance) {
    metadataInstance = new MetadataIndex(config.dataDir);
  }
  return metadataInstance;
}
