/**
 * What a screen shows the instant it is tapped, while its data comes from the server
 * (Kelvin, 2026-11-23: a tap must answer straight away). Each `/m` route's loading.tsx
 * renders one of these; Next streams the real screen in over it.
 */

const Bar = ({ w, h = 14, r = 8, mt = 0 }: { w: string | number; h?: number; r?: number; mt?: number }) => (
  <span className="shimmer" style={{ display: "block", width: w, height: h, borderRadius: r, marginTop: mt }} />
);

function Title({ wide = 140 }: { wide?: number }) {
  return (
    <div className="lt">
      <div>
        <Bar w={wide} h={32} r={10} />
        <Bar w={200} h={12} mt={10} />
      </div>
    </div>
  );
}

function CardRows({ n = 3, tall = 86 }: { n?: number; tall?: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="card" style={{ margin: "0 16px 12px", padding: 14, display: "flex", gap: 12, height: tall }}>
          <Bar w={58} h={58} r={14} />
          <div style={{ flex: 1 }}>
            <Bar w="80%" />
            <Bar w="50%" h={12} mt={8} />
            <Bar w="35%" h={12} mt={8} />
          </div>
        </div>
      ))}
    </>
  );
}

export function HomeSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="home-top"><Bar w={150} h={28} /><span style={{ marginLeft: "auto" }} /><Bar w={34} h={34} r={17} /></div>
      <div style={{ margin: "22px 20px 16px" }}><Bar w="75%" h={30} r={10} /><Bar w="60%" h={30} r={10} mt={8} /></div>
      <div className="card" style={{ margin: "0 16px", height: 116, borderRadius: 26 }} />
      <div style={{ height: 16 }} />
      <CardRows n={1} />
      <div className="section-h"><Bar w={160} h={20} /></div>
      <div className="shelf">
        {[0, 1, 2].map((i) => (
          <div key={i} className="pcard"><Bar w={168} h={168} r={22} /><Bar w="70%" mt={10} /><Bar w="45%" h={18} mt={8} /></div>
        ))}
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 4, title = 130 }: { rows?: number; title?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Title wide={title} />
      <div style={{ height: 8 }} />
      <CardRows n={rows} />
    </div>
  );
}

export function GridSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="shop-top" style={{ position: "static" }}><Bar w={90} h={30} r={10} /><Bar w="100%" h={46} r={14} mt={10} /></div>
      <div className="cat-chips">{[0, 1, 2, 3].map((i) => <Bar key={i} w={92} h={38} r={19} />)}</div>
      <div className="section-h"><Bar w={130} h={20} /></div>
      <div className="shelf-rail">
        {[0, 1, 2].map((i) => (
          <div key={i} className="sc lg"><Bar w="100%" h={196} r={18} /><Bar w="85%" mt={10} /><Bar w="45%" h={18} mt={8} /></div>
        ))}
      </div>
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div style={{ height: 50 }} />
      <div className="card" style={{ margin: "10px 16px 0", height: 250, borderRadius: 22, background: "#3a2a24" }} />
      <div className="track-meta"><Bar w="100%" h={58} r={16} /><Bar w="100%" h={58} r={16} /></div>
      <div className="card rail" style={{ height: 300 }} />
    </div>
  );
}

export function ChatSkeleton() {
  return (
    <div className="chat-frame" aria-busy="true" aria-label="Loading">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Bar w={140} h={24} /><span style={{ marginLeft: "auto" }} /><Bar w={80} h={36} r={18} /></div>
      <div style={{ flex: 1 }} />
      <Bar w="100%" h={56} r={26} />
    </div>
  );
}

/** Screens that load fast or draw their own placeholders: an empty frame, never another screen's skeleton. */
export function BlankSkeleton() {
  return <div aria-busy="true" aria-label="Loading" style={{ minHeight: "60dvh" }} />;
}
