export default function HomePage() {
  return (
    <main className="home-shell">
      <nav aria-label="主导航" className="home-nav">
        <span className="brand">AI 模拟面试</span>
        <a href="#history">历史记录</a>
      </nav>

      <section className="hero" aria-labelledby="home-title">
        <p className="eyebrow">NODE.JS 全栈 + AI AGENT</p>
        <h1 id="home-title">把真实经验，练成清晰的表达。</h1>
        <p className="intro">
          进行一场 45 分钟的中文模拟面试。AI 面试官会围绕项目经历、全栈能力与 Agent 实践持续追问。
        </p>
        <a className="primary-action" href="/interview">
          开始模拟面试
        </a>
      </section>

      <section className="session-note" id="start" aria-label="模拟面试说明">
        <span>45 分钟</span>
        <span>中文面试</span>
        <span>会后反馈</span>
      </section>

      <section className="history-placeholder" id="history" aria-labelledby="history-title">
        <p className="eyebrow">回顾</p>
        <h2 id="history-title">历史记录</h2>
        <p>完成模拟面试后，你的文字转写与反馈会显示在这里。</p>
      </section>
    </main>
  );
}
