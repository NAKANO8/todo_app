import Link from "next/link";
import styles from "./LandingPage.module.css";

function Logo() {
  return (
    <header className={styles.header}>
      <div className={styles.logoLockup}>
        <svg width="26" height="26" viewBox="0 0 36 36" fill="none">
          <rect x="1.5" y="1.5" width="33" height="33" rx="9" stroke="#2f6f5e" strokeWidth="2" />
          <path d="M11 18.5L15.5 23L25 12.5" stroke="#2f6f5e" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className={styles.wordmark}>
          Todo<span className={styles.wordmarkLight}> App</span>
        </div>
      </div>
    </header>
  );
}

function DeviceMockup() {
  return (
    <div className={styles.screenshotWrap}>
      <div className={styles.device}>
        <div className={styles.deviceBar}>
          <span className={styles.deviceDot} />
          <span className={styles.deviceDot} />
          <span className={styles.deviceDot} />
        </div>
        <div className={styles.deviceBody}>
          <div className={styles.toolbar}>
            <div className={styles.pill}>ログアウト</div>
          </div>
          <div className={styles.toolbar}>
            <div className={styles.inputMock}>Todoを入力</div>
            <div className={styles.pill}>追加</div>
          </div>
          <div className={styles.panel}>
            <div className={styles.panelTitle}>未完了のTODO</div>
            <div className={styles.task}>
              <span className={styles.taskDot}>•</span>
              <span>買い物リストを作る</span>
              <span className={styles.miniBtn}>完了</span>
              <span className={styles.miniBtn}>削除</span>
            </div>
          </div>
          <div className={`${styles.panel} ${styles.panelDone}`}>
            <div className={styles.panelTitle}>完了のTODO</div>
            <div className={styles.task}>
              <span className={styles.taskDot}>•</span>
              <span>朝のミーティング資料</span>
              <span className={styles.miniBtn}>戻す</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className={styles.page}>
      <Logo />

      <section className={styles.hero}>
        <h1>シンプルさこそ便利さ。</h1>
        <p>
          毎日続けられる、
          <br />
          それだけを考えたタスク管理。
        </p>
      </section>

      <DeviceMockup />

      <div className={styles.auth}>
        <Link href="/login" className={styles.btnPrimary}>ログイン</Link>
        <Link href="/register" className={styles.btnSecondary}>新規登録</Link>
      </div>

      <footer className={styles.footer}>
        <p>
          © 2026{" "}
          <a href="https://github.com/NAKANO8" target="_blank" rel="noopener">
            NAKANO8
          </a>
        </p>
      </footer>
    </div>
  );
}
