export type RegistryType = 'npm' | 'pypi';
export type PackageSource = 'cache' | 'private' | 'upstream';

export interface PackageVersion {
  version: string;
  size: number;
  filePath: string;
  sha1?: string;
  publishedAt: number;
  downloadCount: number;
}

export interface PackageInfo {
  name: string;
  registry: RegistryType;
  source: PackageSource;
  versions: PackageVersion[];
  latestVersion: string;
  description?: string;
  author?: string;
  license?: string;
  scope?: string;
  createdAt: number;
  updatedAt: number;
  totalSize: number;
  downloadCount: number;
}

export interface PackageListResponse {
  packages: PackageInfo[];
  total: number;
}

export interface CacheStats {
  totalPackages: number;
  totalVersions: number;
  totalSize: number;
  npmPackages: number;
  pypiPackages: number;
  privatePackages: number;
  cachePackages: number;
  maxSize: number;
  usagePercent: number;
  npmSize: number;
  pypiSize: number;
  privateSize: number;
  cacheSize: number;
  largestPackages: Array<{
    name: string;
    registry: RegistryType;
    size: number;
    versions: number;
    growth: number;
  }>;
  recentGrowth: Array<{
    date: string;
    growth: number;
  }>;
}

export interface StorageTrend {
  date: string;
  size: number;
  packages: number;
  npmSize: number;
  pypiSize: number;
  privateSize: number;
  cacheSize: number;
}

export interface RegistryBreakdown {
  registry: RegistryType;
  packages: number;
  versions: number;
  size: number;
  percent: number;
}

export interface ScopeStats {
  scope: string;
  packages: number;
  size: number;
  percent: number;
  uncategorized: boolean;
}

export interface LargestPackage {
  name: string;
  registry: RegistryType;
  source: PackageSource;
  scope?: string;
  size: number;
  versions: number;
  latestVersion: string;
  updatedAt: number;
  growth7d: number;
  sizeRank: number;
}

export interface StorageBreakdownResponse {
  registry: RegistryBreakdown[];
  source: Array<{ source: PackageSource; size: number }>;
}

export interface ScopeStatsResponse {
  scopes: ScopeStats[];
}

export interface LargestPackagesResponse {
  packages: LargestPackage[];
}

export interface CachePolicy {
  maxSizeGB: number;
  maxAgeDays: number;
  autoClean: boolean;
}

export interface HealthInfo {
  status: string;
  timestamp: number;
  version: string;
  config: {
    storageDir: string;
    port: number;
    npmUpstream: string;
    pypiUpstream: string;
    privateScopes: string[];
  };
}
