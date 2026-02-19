export function Home() {
  return (
    <div className="w-full max-w-[42rem] mx-auto py-4">
      <section className="text-center mb-8">
        <img
          src="/logo.png"
          alt="Aurora Cobble"
          className="block w-full max-w-[min(560px,95vw)] h-auto mx-auto mb-6 object-contain rounded-lg"
        />
        <p className="text-lg text-muted m-0">Cobblemon ranked stats & leaderboards</p>
      </section>
      <section className="text-center text-muted text-[0.95rem]">
        <p className="m-0">
          Use the menu to view <strong className="text-[#e6edf3]">Leaderboard</strong> or{' '}
          <strong className="text-[#e6edf3]">Usage Stats</strong>.
        </p>
      </section>
    </div>
  )
}
