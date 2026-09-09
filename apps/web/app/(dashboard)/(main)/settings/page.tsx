"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { TitleActionHeader } from "@/components/title-action-header";
import { toast } from "sonner";
import { ProfileManager } from "@/components/settings/profile-manager";
import { AiChannelsCard } from "@/components/settings/ai-channels-card";

const selectClass =
  "mt-1 block w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-accent-300 focus:outline-none focus:ring-1 focus:ring-accent-300";
const inputClass =
  "mt-1 block w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-accent-300 focus:outline-none focus:ring-1 focus:ring-accent-300";
const labelClass = "block text-sm font-medium text-neutral-700 font-body";

export default function SettingsPage() {
  const { data, isLoading } = trpc.preferences.get.useQuery();
  const updateMutation = trpc.preferences.update.useMutation({
    onSuccess: () => toast.success("偏好设置已保存"),
    onError: (err) => toast.error(err.message),
  });

  const [timezone, setTimezone] = useState("UTC");
  const [units, setUnits] = useState("metric");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [biologicalSex, setBiologicalSex] = useState("");
  const [bloodType, setBloodType] = useState("");
  const [showOptimalRanges, setShowOptimalRanges] = useState(true);

  const toggleOptimalMutation = trpc.optimalRanges.toggleVisibility.useMutation(
    {
      onSuccess: () => toast.success("偏好已保存"),
      onError: (err) => toast.error(err.message),
    },
  );

  useEffect(() => {
    if (data) {
      setTimezone(data.timezone);
      setUnits(data.preferredUnits);
      setDateOfBirth(data.dateOfBirth ?? "");
      setBiologicalSex(data.biologicalSex ?? "");
      setBloodType(data.bloodType ?? "");
      setShowOptimalRanges(data.showOptimalRanges ?? true);
    }
  }, [data]);

  const handleSave = () => {
    updateMutation.mutate({
      timezone,
      preferredUnits: units as "metric" | "imperial",
      ...(dateOfBirth && { dateOfBirth }),
      ...(biologicalSex && {
        biologicalSex: biologicalSex as "male" | "female" | "intersex",
      }),
      ...(bloodType && { bloodType: bloodType as any }),
    });
  };

  if (isLoading) {
    return (
      <div>
        <TitleActionHeader title="设置" subtitle="加载中…" />
        <div className="card max-w-3xl h-64 animate-pulse bg-neutral-50" />
      </div>
    );
  }

  return (
    <div>
      <TitleActionHeader title="设置" subtitle="管理你的个人偏好与档案。" />

      <div className="mt-7 max-w-3xl space-y-6">
        {/* General Preferences */}
        <div className="card p-6 space-y-6">
          <h2 className="text-lg font-medium tracking-[-0.015em] text-neutral-900 font-display">
            偏好设置
          </h2>
          <div>
            <label htmlFor="timezone" className={labelClass}>
              时区
            </label>
            <select
              id="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className={selectClass}
            >
              <option value="Asia/Shanghai">中国标准时间</option>
              <option value="UTC">UTC</option>
              <option value="America/New_York">美东时间</option>
              <option value="America/Chicago">美中时间</option>
              <option value="America/Denver">美山时间</option>
              <option value="America/Los_Angeles">美西时间</option>
            </select>
          </div>
          <div>
            <label htmlFor="units" className={labelClass}>
              单位制
            </label>
            <select
              id="units"
              value={units}
              onChange={(e) => setUnits(e.target.value)}
              className={selectClass}
            >
              <option value="metric">公制</option>
              <option value="imperial">英制</option>
            </select>
          </div>
        </div>

        {/* Demographic Profile */}
        <div className="card p-6 space-y-6">
          <div>
            <h2 className="text-lg font-medium tracking-[-0.015em] text-neutral-900 font-display">
              人口学信息
            </h2>
            <p className="mt-1 text-[13px] text-neutral-500 font-body">
              用于按性别和年龄匹配检验结果的参考区间。
            </p>
          </div>
          <div>
            <label htmlFor="dateOfBirth" className={labelClass}>
              出生日期
            </label>
            <input
              id="dateOfBirth"
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="biologicalSex" className={labelClass}>
              生理性别
            </label>
            <select
              id="biologicalSex"
              value={biologicalSex}
              onChange={(e) => setBiologicalSex(e.target.value)}
              className={selectClass}
            >
              <option value="">未设置</option>
              <option value="male">男</option>
              <option value="female">女</option>
              <option value="intersex">间性</option>
            </select>
          </div>
          <div>
            <label htmlFor="bloodType" className={labelClass}>
              血型
            </label>
            <select
              id="bloodType"
              value={bloodType}
              onChange={(e) => setBloodType(e.target.value)}
              className={selectClass}
            >
              <option value="">未设置</option>
              <option value="A+">A+</option>
              <option value="A-">A-</option>
              <option value="B+">B+</option>
              <option value="B-">B-</option>
              <option value="AB+">AB+</option>
              <option value="AB-">AB-</option>
              <option value="O+">O+</option>
              <option value="O-">O-</option>
            </select>
          </div>
        </div>

        {/* 家庭成员档案 */}
        <ProfileManager />

        {/* AI 模型渠道 */}
        <AiChannelsCard />

        {/* Optimal Ranges */}
        <div className="card p-6 space-y-4">
          <div>
            <h2 className="text-lg font-medium tracking-[-0.015em] text-neutral-900 font-display">
              理想区间
            </h2>
            <p className="mt-1 text-[13px] text-neutral-500 font-body">
              来自权威来源的优化目标区间，与标准临床参考区间一同显示。
            </p>
          </div>
          <div className="flex items-center justify-between">
            <label htmlFor="showOptimalRanges" className={labelClass}>
              显示理想区间
            </label>
            <button
              id="showOptimalRanges"
              role="switch"
              aria-checked={showOptimalRanges}
              onClick={() => {
                const next = !showOptimalRanges;
                setShowOptimalRanges(next);
                toggleOptimalMutation.mutate({ show: next });
              }}
              className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              style={{
                backgroundColor: showOptimalRanges
                  ? "var(--color-health-optimal)"
                  : "var(--color-neutral-300)",
              }}
            >
              <span
                className="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform"
                style={{
                  transform: showOptimalRanges
                    ? "translateX(20px)"
                    : "translateX(0)",
                }}
              />
            </button>
          </div>
          <Link
            href="/settings/optimal-ranges"
            className="inline-flex items-center gap-1 text-sm font-medium text-accent-600 hover:text-accent-700 transition-colors"
          >
            自定义区间
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>

        <button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 transition-colors disabled:opacity-50"
        >
          {updateMutation.isPending ? "保存中…" : "保存偏好"}
        </button>
      </div>
    </div>
  );
}
