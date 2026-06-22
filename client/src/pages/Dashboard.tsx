import { useEffect, useState, useMemo } from 'react';
import {
  Package as PackageIcon,
  Database,
  Archive,
  Lock,
  HardDrive,
  TrendingUp,
  TrendingDown,
  Loader2,
  RefreshCw,
  Calendar,
  AlertTriangle,
  PieChart as PieChartIcon,
  BarChart3,
  Activity,
  Clock,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { api } from '../api';
import type { CacheStats, StorageTrend, RegistryBreakdown, ScopeStats, LargestPackage } from '../types';
import { formatSize, formatNumber } from '../utils';

const COLORS = ['#6366f1', '#0ea5e9', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4'];

const TIME_RANGES = [
  { label: '近7天', value: 7 },
  { label: '近30天', value: 30 },
  { label: '近90天', value: 90 },
  { label: '近1年', value: 365 },
];

export default function Dashboard() {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [trend, setTrend] = useState<StorageTrend[]>([]);
  const [breakdown, setBreakdown] = useState<RegistryBreakdown[]>([]);
  const [scopeStats, setScopeStats] = useState<ScopeStats[]>([]);
  const [largestPkgs, setLargestPkgs] = useState<LargestPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState(30);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'registry' | 'scope' | 'anomaly'>('overview');

  const loadData = async () => {
    setLoading(true);
    try {
      const [s, t, b, sc, lp] = await Promise.all([
        api.getStats(),
        useCustomRange && customStart
          ? api.getTrendByRange(customStart, customEnd || undefined)
          : api.getTrend(timeRange),
        api.getBreakdown(),
        api.getScopeStats(),
        api.getLargestPackages(20),
      ]);
      setStats(s);
      setTrend(t);
      setBreakdown(b.registry);
      setScopeStats(sc.scopes);
      setLargestPkgs(lp.packages);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [timeRange, useCustomRange, customStart, customEnd]);

  const pieData = useMemo(() => {
    if (!stats) return [];
    return [
      { name: 'NPM', value: stats.npmSize, color: '#f59e0b' },
      { name: 'PyPI', value: stats.pypiSize, color: '#0ea5e9' },
    ];
  }, [stats]);

  const sourcePieData = useMemo(() => {
    if (!stats) return [];
    return [
      { name: '代理缓存', value: stats.cacheSize, color: '#6366f1' },
      { name: '私有包', value: stats.privateSize, color: '#ef4444' },
    ];
  }, [stats]);

  const anomalyPackages = useMemo(() => {
    return largestPkgs
      .filter((p) => p.growth7d > 30 || p.size > 100 * 1024 * 1024)
      .sort((a, b) => b.growth7d - a.growth7d);
  }, [largestPkgs]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-indigo-600" size={32} />
      </div>
    );
  }

  const statCards = stats
    ? [
        {
          label: '缓存包总数',
          value: formatNumber(stats.totalPackages),
          sub: `${formatNumber(stats.totalVersions)} 个版本`,
          icon: PackageIcon,
          color: 'from-indigo-500 to-indigo-600',
          bg: 'bg-indigo-50',
          text: 'text-indigo-600',
        },
        {
          label: '存储占用',
          value: formatSize(stats.totalSize),
          sub: `${stats.usagePercent.toFixed(1)}% 已使用`,
          icon: HardDrive,
          color: 'from-emerald-500 to-emerald-600',
          bg: 'bg-emerald-50',
          text: 'text-emerald-600',
        },
        {
          label: 'NPM 存储',
          value: formatSize(stats.npmSize),
          sub: `${formatNumber(stats.npmPackages)} 个包`,
          icon: Archive,
          color: 'from-orange-500 to-orange-600',
          bg: 'bg-orange-50',
          text: 'text-orange-600',
        },
        {
          label: 'PyPI 存储',
          value: formatSize(stats.pypiSize),
          sub: `${formatNumber(stats.pypiPackages)} 个包`,
          icon: Database,
          color: 'from-sky-500 to-sky-600',
          bg: 'bg-sky-50',
          text: 'text-sky-600',
        },
        {
          label: '私有包存储',
          value: formatSize(stats.privateSize),
          sub: `${formatNumber(stats.privatePackages)} 个包`,
          icon: Lock,
          color: 'from-rose-500 to-rose-600',
          bg: 'bg-rose-50',
          text: 'text-rose-600',
        },
        {
          label: '代理缓存存储',
          value: formatSize(stats.cacheSize),
          sub: `${formatNumber(stats.cachePackages)} 个包`,
          icon: TrendingDown,
          color: 'from-violet-500 to-violet-600',
          bg: 'bg-violet-50',
          text: 'text-violet-600',
        },
      ]
    : [];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">存储分析面板</h1>
          <p className="text-sm text-slate-500 mt-1">
            多维度分析本地镜像仓库的存储使用情况
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn btn-secondary" onClick={loadData}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            刷新数据
          </button>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Calendar size={16} />
            <span>时间范围：</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {TIME_RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => { setUseCustomRange(false); setTimeRange(r.value); }}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  !useCustomRange && timeRange === r.value
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {r.label}
              </button>
            ))}
            <button
              onClick={() => setUseCustomRange(!useCustomRange)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                useCustomRange
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              自定义
            </button>
          </div>
          {useCustomRange && (
            <div className="flex items-center gap-2 ml-0 sm:ml-auto">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="input text-sm"
                placeholder="开始日期"
              />
              <span className="text-slate-400">至</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="input text-sm"
                placeholder="结束日期"
              />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <div key={i} className="card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500">{card.label}</p>
                  <p className="text-2xl font-bold text-slate-800 mt-1">{card.value}</p>
                  <p className="text-xs text-slate-400 mt-1">{card.sub}</p>
                </div>
                <div className={`w-11 h-11 rounded-xl ${card.bg} ${card.text} flex items-center justify-center`}>
                  <Icon size={22} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {stats && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">存储使用率</h2>
              <p className="text-sm text-slate-500">
                当前 {formatSize(stats.totalSize)} / 上限 {formatSize(stats.maxSize)}
              </p>
            </div>
            <span
              className={`badge ${
                stats.usagePercent >= 80
                  ? 'bg-red-100 text-red-700'
                  : stats.usagePercent >= 60
                  ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {stats.usagePercent.toFixed(1)}%
            </span>
          </div>
          <div className="progress-bar">
            <div
              className={`progress-fill ${
                stats.usagePercent >= 80
                  ? 'bg-red-500'
                  : stats.usagePercent >= 60
                  ? 'bg-yellow-500'
                  : 'bg-gradient-to-r from-indigo-500 to-emerald-500'
              }`}
              style={{ width: `${Math.min(100, stats.usagePercent)}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit">
        {[
          { key: 'overview', label: '总览', icon: Activity },
          { key: 'registry', label: '按类型', icon: PieChartIcon },
          { key: 'scope', label: '按 Scope', icon: BarChart3 },
          { key: 'anomaly', label: '异常检测', icon: AlertTriangle },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              <Icon size={16} />
              {tab.label}
              {tab.key === 'anomaly' && anomalyPackages.length > 0 && (
                <span className="px-1.5 py-0.5 text-xs bg-red-100 text-red-600 rounded-full">
                  {anomalyPackages.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">存储增长趋势</h2>
            <div className="h-72">
              {trend.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="sizeGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="npmGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="pypiGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => formatSize(v as number)}
                      width={70}
                    />
                    <Tooltip
                      formatter={(v: number) => formatSize(v)}
                      labelFormatter={(l) => `日期: ${l}`}
                      contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="npmSize"
                      name="NPM"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      fill="url(#npmGrad)"
                      stackId="1"
                    />
                    <Area
                      type="monotone"
                      dataKey="pypiSize"
                      name="PyPI"
                      stroke="#0ea5e9"
                      strokeWidth={2}
                      fill="url(#pypiGrad)"
                      stackId="1"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                  暂无趋势数据，系统运行一段时间后将自动记录
                </div>
              )}
            </div>
          </div>

          <div className="card p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">包数量趋势</h2>
            <div className="h-72">
              {trend.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      axisLine={false}
                      tickLine={false}
                      width={50}
                    />
                    <Tooltip
                      formatter={(v: number) => formatNumber(v)}
                      labelFormatter={(l) => `日期: ${l}`}
                      contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
                    />
                    <Bar dataKey="packages" fill="#10b981" radius={[4, 4, 0, 0]} name="包数量" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                  暂无趋势数据
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'registry' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">按仓库类型存储分布</h2>
            <div className="h-72">
              {pieData.some((d) => d.value > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
                      labelLine={{ stroke: '#94a3b8' }}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number) => formatSize(v)}
                      contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                  暂无数据
                </div>
              )}
            </div>
          </div>

          <div className="card p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">按来源存储分布</h2>
            <div className="h-72">
              {sourcePieData.some((d) => d.value > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={sourcePieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
                      labelLine={{ stroke: '#94a3b8' }}
                    >
                      {sourcePieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number) => formatSize(v)}
                      contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                  暂无数据
                </div>
              )}
            </div>
          </div>

          <div className="card p-6 lg:col-span-2">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">各类型详细对比</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">类型</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">包数量</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">版本数</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">存储大小</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">占比</th>
                    <th className="py-3 px-4 text-sm font-medium text-slate-500">分布</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map((item) => (
                    <tr key={item.registry} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-3 h-3 rounded-full ${
                              item.registry === 'npm' ? 'bg-orange-500' : 'bg-sky-500'
                            }`}
                          />
                          <span className="font-medium text-slate-800">
                            {item.registry === 'npm' ? 'NPM Registry' : 'PyPI Index'}
                          </span>
                        </div>
                      </td>
                      <td className="text-right py-3 px-4 text-slate-600">{formatNumber(item.packages)}</td>
                      <td className="text-right py-3 px-4 text-slate-600">{formatNumber(item.versions)}</td>
                      <td className="text-right py-3 px-4 font-semibold text-slate-800">{formatSize(item.size)}</td>
                      <td className="text-right py-3 px-4 text-slate-600">{item.percent.toFixed(1)}%</td>
                      <td className="py-3 px-4 w-48">
                        <div className="progress-bar h-2">
                          <div
                            className={`progress-fill ${
                              item.registry === 'npm' ? 'bg-orange-500' : 'bg-sky-500'
                            }`}
                            style={{ width: `${item.percent}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'scope' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="card p-6 lg:col-span-2">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">按 Scope 存储分布</h2>
            <div className="h-96">
              {scopeStats.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={scopeStats.slice(0, 15)}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => formatSize(v)}
                    />
                    <YAxis
                      type="category"
                      dataKey="scope"
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                      width={100}
                    />
                    <Tooltip
                      formatter={(v: number) => formatSize(v)}
                      contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
                    />
                    <Bar dataKey="size" name="存储大小" radius={[0, 4, 4, 0]}>
                      {scopeStats.slice(0, 15).map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.uncategorized ? '#cbd5e1' : COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                  暂无 Scope 数据
                </div>
              )}
            </div>
          </div>

          <div className="card p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Scope 明细</h2>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {scopeStats.map((scope, idx) => {
                const color = scope.uncategorized ? '#cbd5e1' : COLORS[idx % COLORS.length];
                return (
                  <div
                    key={scope.scope}
                    className={`p-3 rounded-lg ${
                      scope.uncategorized ? 'bg-slate-100 border border-dashed border-slate-300' : 'bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <span className="font-medium text-sm text-slate-800 truncate max-w-32">
                          {scope.scope}
                        </span>
                        {scope.uncategorized && (
                          <span className="px-1.5 py-0.5 text-xs bg-slate-200 text-slate-500 rounded">
                            未分类
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-500">{scope.percent.toFixed(1)}%</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">{formatNumber(scope.packages)} 个包</span>
                      <span className="font-semibold text-slate-800">{formatSize(scope.size)}</span>
                    </div>
                    <div className="progress-bar h-1.5 mt-2">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${scope.percent}%`,
                          backgroundColor: color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              {scopeStats.length === 0 && (
                <div className="text-center py-8 text-slate-400 text-sm">
                  暂无数据
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'anomaly' && (
        <div className="space-y-6">
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">异常包检测</h2>
                <p className="text-sm text-slate-500">
                  检测到 {anomalyPackages.length} 个可能异常的包（大小超过 100MB 或近7天增长超过 30%）
                </p>
              </div>
              {anomalyPackages.length > 0 && (
                <span className="flex items-center gap-2 px-3 py-1 bg-red-50 text-red-600 rounded-full text-sm">
                  <AlertTriangle size={14} />
                  需要关注
                </span>
              )}
            </div>

            {anomalyPackages.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">排名</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">包名</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">类型</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">Scope</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">大小</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">版本数</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">7天增长</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">最新更新</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anomalyPackages.map((pkg) => (
                      <tr
                        key={`${pkg.registry}-${pkg.name}`}
                        className="border-b border-slate-100 hover:bg-slate-50"
                      >
                        <td className="py-3 px-4">
                          <span className={`w-6 h-6 inline-flex items-center justify-center rounded-full text-xs font-bold ${
                            pkg.sizeRank <= 3 ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {pkg.sizeRank}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-medium text-slate-800">{pkg.name}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 text-xs rounded-full ${
                            pkg.registry === 'npm' ? 'bg-orange-100 text-orange-700' : 'bg-sky-100 text-sky-700'
                          }`}>
                            {pkg.registry.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-slate-500 text-sm">{pkg.scope || '-'}</span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className={`font-semibold ${
                            pkg.size > 500 * 1024 * 1024 ? 'text-red-600' :
                            pkg.size > 100 * 1024 * 1024 ? 'text-orange-600' : 'text-slate-800'
                          }`}>
                            {formatSize(pkg.size)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-slate-600">
                          {pkg.versions}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className={`inline-flex items-center gap-1 ${
                            pkg.growth7d >= 50 ? 'text-red-600' :
                            pkg.growth7d >= 30 ? 'text-orange-600' : 'text-emerald-600'
                          }`}>
                            <TrendingUp size={14} />
                            {pkg.growth7d}%
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-slate-500 text-sm">
                          <span className="inline-flex items-center gap-1">
                            <Clock size={12} />
                            {new Date(pkg.updatedAt).toLocaleDateString('zh-CN')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                  <TrendingUp className="text-emerald-600" size={28} />
                </div>
                <p className="text-slate-600 font-medium">一切正常</p>
                <p className="text-sm text-slate-400 mt-1">
                  未检测到异常增长的包，存储使用情况良好
                </p>
              </div>
            )}
          </div>

          <div className="card p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Top 20 占用空间最大的包</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">排名</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">包名</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">类型</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">来源</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">大小</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">版本</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">7天增长</th>
                  </tr>
                </thead>
                <tbody>
                  {largestPkgs.map((pkg) => (
                    <tr
                      key={`${pkg.registry}-${pkg.name}`}
                      className="border-b border-slate-100 hover:bg-slate-50"
                    >
                      <td className="py-3 px-4">
                        <span className={`w-6 h-6 inline-flex items-center justify-center rounded-full text-xs font-bold ${
                          pkg.sizeRank === 1 ? 'bg-yellow-100 text-yellow-700' :
                          pkg.sizeRank === 2 ? 'bg-slate-200 text-slate-700' :
                          pkg.sizeRank === 3 ? 'bg-orange-100 text-orange-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {pkg.sizeRank}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-medium text-slate-800">{pkg.name}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 text-xs rounded-full ${
                          pkg.registry === 'npm' ? 'bg-orange-100 text-orange-700' : 'bg-sky-100 text-sky-700'
                        }`}>
                          {pkg.registry.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 text-xs rounded-full ${
                          pkg.source === 'private' ? 'bg-rose-100 text-rose-700' :
                          pkg.source === 'cache' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {pkg.source === 'private' ? '私有' : pkg.source === 'cache' ? '缓存' : '上游'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-slate-800">
                        {formatSize(pkg.size)}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-600">
                        {pkg.versions}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className={`inline-flex items-center gap-1 ${
                          pkg.growth7d >= 50 ? 'text-red-600' :
                          pkg.growth7d >= 30 ? 'text-orange-600' :
                          pkg.growth7d > 0 ? 'text-emerald-600' : 'text-slate-400'
                        }`}>
                          {pkg.growth7d > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                          {pkg.growth7d}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
