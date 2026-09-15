/* eslint-disable @next/next/no-html-link-for-pages -- Vinext's Workers output keeps same-origin navigation as native links. */
/** Keep the PvP shell static; the interactive board owns its own data path. */
export default function Home() {
  return <main className="shell">
    <nav className="topbar">
      <a className="wordmark" href="/">LR <span>COMMUNITY</span></a>
    </nav>
    <header className="intro">
      <p className="eyebrow">UNOFFICIAL STATISTICS</p>
      <h1>LINEレンジャー<br />レジェンド帯キャラ集計</h1>
      <p>レジェンド帯プレイヤーの防衛チームから、キャラクターの編成数と採用率を集計しています。</p>
      <p className="tap-hint">キャラクターをタップすると、装備ランキングが見れます。</p>
    </header>
  </main>;
}
