import { Header } from "../components/Header";
import { Navbar } from "../components/Navbar";

export default function Home() {
  return (
    <div className="flex flex-col w-full min-h-screen bg-zinc-50 transition-all duration-300 px-6 py-10 md:px-32 md:py-10">
      <header className="w-full sticky top-0 bg-white/80 backdrop-blur-md border-b border-zinc-200 z-50 rounded-2xl shadow-sm">
        <Header />
      </header>

      <main className="grow w-full py-16 px-4 bg-white/40 min-h-[400px]">
        {/* Konten utama di sini */}
      </main>

      <div className="fixed bottom-6 left-0 right-0 z-50 flex justify-center pointer-events-none">
        <div className="pointer-events-auto">
          <Navbar />
        </div>
      </div>
    </div>
  );
}
