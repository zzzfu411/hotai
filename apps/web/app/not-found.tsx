import Link from "next/link";
import Image from "next/image";

export default function NotFound() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-24 text-center">
      <Image
        src="/404-flameout.svg"
        alt=""
        width={320}
        height={240}
        className="mx-auto h-36 w-auto opacity-80"
      />
      <h1 className="mt-6 text-5xl font-black tracking-tight">
        <span className="fire-text">404</span>
      </h1>
      <p className="mt-3 text-sm text-ink-600 dark:text-ink-300">
        The flame died here. This page doesn&apos;t exist (or was never hot enough to keep).
      </p>
      <Link
        href="/"
        className="inline-block mt-6 px-4 py-2 rounded-full fire-gradient text-white text-sm font-semibold shadow hover:shadow-md transition"
      >
        ← Back to the heat
      </Link>
    </div>
  );
}
