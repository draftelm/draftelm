import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="flex flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-8">
      <Link href="/" className="text-xl font-bold tracking-tight">DRAFTELM</Link>

      <div className="hidden gap-8 text-sm text-gray-300 md:flex">
        <a href="#">How it works</a>
        <a href="#">Examples</a>
        <a href="#">Pricing</a>
      </div>

      <div className="flex items-center gap-4">
      <Link href="/furniture" className="text-sm text-blue-200 hover:text-white">Furniture preview</Link>
      <button className="rounded-full border border-white/20 px-5 py-2 text-sm text-white hover:bg-white/10">
        Sign in
      </button>
      </div>
    </nav>
  );
}
