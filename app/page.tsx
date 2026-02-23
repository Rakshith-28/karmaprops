import Link from "next/link";
import Nav from "@/app/components/Nav";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        {/* Hero */}
        <section className="hero">
          <div className="container">
            <h1 className="serif">
              Property management,<br />
              <em>automated</em>
            </h1>
            <p>
              AI-powered assistant that responds to your rental prospects
              instantly, 24/7. Review and approve every reply before it&apos;s sent.
            </p>
            <div className="hero-actions">
              <Link href="/chat" className="btn btn-primary">
                Try the Assistant →
              </Link>
              <Link href="/dashboard" className="btn btn-ghost">
                View Dashboard
              </Link>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="stats-section">
          <div className="container">
            <div className="stats-grid">
              <div className="stat">
                <h3 className="serif">24/7</h3>
                <p>Always responding to prospects</p>
              </div>
              <div className="stat">
                <h3 className="serif">&lt;5s</h3>
                <p>Average AI response time</p>
              </div>
              <div className="stat">
                <h3 className="serif">100%</h3>
                <p>Human-approved messages</p>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="features">
          <div className="container">
            <div className="features-grid">
              <div className="feature-card">
                <div className="feature-icon">🤖</div>
                <h3>AI-Powered Replies</h3>
                <p>
                  Reads your property knowledge base and generates accurate,
                  professional replies to prospect inquiries.
                </p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">✅</div>
                <h3>Human Approval</h3>
                <p>
                  Every AI-generated reply waits for your approval before being
                  sent. Edit, approve, or reject from the dashboard.
                </p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">💬</div>
                <h3>SMS Integration</h3>
                <p>
                  Connects with Quo (OpenPhone) to receive and send text messages
                  directly to prospects&apos; phones.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="footer">
          <div className="container">
            <p>KarmaProps © {new Date().getFullYear()} — Built with Next.js, Groq AI &amp; Quo</p>
          </div>
        </footer>
      </main>
    </>
  );
}