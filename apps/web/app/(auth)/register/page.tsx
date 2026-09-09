"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signUp } from "@/lib/auth/client";
import { LogoWordmark } from "@/assets/app/images/logo";
import { toast } from "sonner";
import { Button } from "@/components/button";
export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (password.length < 8) {
      toast.error("密码至少需要 8 个字符");
      return;
    }

    setLoading(true);
    try {
      const { error } = await signUp.email({ name, email, password });
      if (error) {
        toast.error(error.message ?? "账号创建失败");
        return;
      }
      toast.success("账号创建成功");
      router.push("/onboarding");
    } catch {
      toast.error("出错了，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-[380px] animate-fade-in">
      {/* Mobile logo */}
      <LogoWordmark className="mb-8 lg:hidden" />

      <h1 className="text-[26px] font-medium tracking-[-0.025em] text-neutral-900 font-display">
        创建你的账号
      </h1>
      <p className="mt-2 text-[14px] text-neutral-500 font-body">
        免费开源，数据完全属于你。
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div>
          <label
            htmlFor="name"
            className="block text-[13px] font-medium text-neutral-700 font-body"
          >
            姓名
          </label>
          <input
            id="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1.5 block w-full rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-[14px] text-neutral-900 placeholder:text-neutral-400 transition-all focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100"
            placeholder="你的名字"
          />
        </div>

        <div>
          <label
            htmlFor="email"
            className="block text-[13px] font-medium text-neutral-700 font-body"
          >
            邮箱
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 block w-full rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-[14px] text-neutral-900 placeholder:text-neutral-400 transition-all focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-[13px] font-medium text-neutral-700 font-body"
          >
            密码
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 block w-full rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-[14px] text-neutral-900 placeholder:text-neutral-400 transition-all focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100"
            placeholder="至少 8 个字符"
          />
        </div>

        <Button
          type="submit"
          text={loading ? "创建中…" : "创建账号"}
          loading={loading}
        />
      </form>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-neutral-400 font-body">
        创建账号即表示你同意 HealthManager++ 的开源许可条款。你的健康数据加密存储，
        未经你的明确同意绝不共享。
      </p>

      <p className="mt-6 text-center text-[13px] text-neutral-500 font-body">
        已有账号？{" "}
        <Link
          href="/login"
          className="font-medium text-accent-600 hover:text-accent-700 transition-colors"
        >
          登录
        </Link>
      </p>
    </div>
  );
}
