import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from './Typography';
import Svg, { Polygon, Rect, Defs, ClipPath, Image as SvgImage } from 'react-native-svg';

const FRAME = require('./assets/puzzle_frame.png');
const BW = 760;
const BH = 428;
const SNAP_DIST = 55;

const computeGeom = (p) => {
  const xs = p.pts.map((q) => q[0]);
  const ys = p.pts.map((q) => q[1]);
  const minx = Math.min(...xs);
  const miny = Math.min(...ys);
  const maxx = Math.max(...xs);
  const maxy = Math.max(...ys);
  return {
    ...p,
    home: { x: minx, y: miny },
    w: maxx - minx,
    h: maxy - miny,
    local: p.pts.map((q) => [q[0] - minx, q[1] - miny]),
  };
};

// Random cut each round: grid of cells, each kept square or split into 2 triangles (random diagonal).
function makePieces() {
  const cols = 2 + Math.floor(Math.random() * 2); // 2-3
  const rows = 2;
  const cw = BW / cols;
  const ch = BH / rows;
  const raw = [];
  let id = 0;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x0 = c * cw;
      const y0 = r * ch;
      const x1 = x0 + cw;
      const y1 = y0 + ch;
      const roll = Math.random();
      if (roll < 0.28) {
        // square / rectangle
        raw.push({ id: `p${id++}`, pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] });
      } else if (roll < 0.46) {
        // two triangles (diagonal ↘)
        raw.push({ id: `p${id++}`, pts: [[x0, y0], [x1, y0], [x1, y1]] });
        raw.push({ id: `p${id++}`, pts: [[x0, y0], [x1, y1], [x0, y1]] });
      } else if (roll < 0.64) {
        // two triangles (diagonal ↙)
        raw.push({ id: `p${id++}`, pts: [[x0, y0], [x1, y0], [x0, y1]] });
        raw.push({ id: `p${id++}`, pts: [[x1, y0], [x1, y1], [x0, y1]] });
      } else if (roll < 0.82) {
        // slanted vertical cut → two parallelogram/trapezoid pieces
        const a = x0 + cw * 0.62;
        const b = x0 + cw * 0.38;
        raw.push({ id: `p${id++}`, pts: [[x0, y0], [a, y0], [b, y1], [x0, y1]] });
        raw.push({ id: `p${id++}`, pts: [[a, y0], [x1, y0], [x1, y1], [b, y1]] });
      } else {
        // slanted horizontal cut → two parallelogram/trapezoid pieces
        const a = y0 + ch * 0.62;
        const b = y0 + ch * 0.38;
        raw.push({ id: `p${id++}`, pts: [[x0, y0], [x1, y0], [x1, b], [x0, a]] });
        raw.push({ id: `p${id++}`, pts: [[x0, a], [x1, b], [x1, y1], [x0, y1]] });
      }
    }
  }
  return raw.map(computeGeom);
}

const ptsStr = (pts) => pts.map((q) => `${q[0]},${q[1]}`).join(' ');
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export default function PuzzleScreen({ onDone }) {
  const PIECES = useMemo(makePieces, []);
  const [layout, setLayout] = useState(null);
  const posRef = useRef(null); // [{x,y,placed}]
  const startRef = useRef({});
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);

  const boardLeft = layout ? (layout.w - BW) / 2 : 0;
  const boardTop = layout ? (layout.h - BH) / 2 : 0;

  // Scatter pieces around the board once we know the screen size (clamped on-screen).
  useEffect(() => {
    if (!layout || posRef.current) return;
    const step = (layout.w - 120) / 3;
    posRef.current = PIECES.map((pc, i) => {
      const col = Math.floor(i / 2);
      const bottom = i % 2 === 0;
      const x = clamp(24 + col * step, 8, layout.w - pc.w - 8);
      const y = bottom ? layout.h - pc.h - 16 : 16;
      return { x, y, placed: false };
    });
    rerender();
  }, [layout]);

  const responders = useMemo(() => {
    if (!layout) return [];
    return PIECES.map((pc, idx) =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !!posRef.current && !posRef.current[idx].placed,
        onMoveShouldSetPanResponder: () => !!posRef.current && !posRef.current[idx].placed,
        onPanResponderGrant: () => {
          startRef.current[idx] = { ...posRef.current[idx] };
        },
        onPanResponderMove: (e, g) => {
          const s = startRef.current[idx];
          if (!s) return;
          posRef.current[idx] = {
            placed: false,
            x: clamp(s.x + g.dx, 0, layout.w - pc.w),
            y: clamp(s.y + g.dy, 0, layout.h - pc.h),
          };
          rerender();
        },
        onPanResponderRelease: () => {
          const tx = boardLeft + pc.home.x;
          const ty = boardTop + pc.home.y;
          const p = posRef.current[idx];
          if (Math.hypot(p.x - tx, p.y - ty) < SNAP_DIST) {
            posRef.current[idx] = { x: tx, y: ty, placed: true };
          }
          rerender();
          if (posRef.current.every((q) => q.placed)) {
            setTimeout(onDone, 700);
          }
        },
      })
    );
  }, [layout, boardLeft, boardTop]);

  return (
    <View style={styles.overlay} onLayout={(e) => setLayout({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <View style={styles.topic}>
        <Text style={styles.topicText}>조각을 알맞은 곳에 맞춰봐! 🧩</Text>
      </View>

      {layout ? (
        <Svg style={[styles.board, { left: boardLeft, top: boardTop }]} width={BW} height={BH} viewBox={`0 0 ${BW} ${BH}`}>
          <Rect x={0} y={0} width={BW} height={BH} fill="#dfe7f5" />
          <SvgImage href={FRAME} x={0} y={0} width={BW} height={BH} preserveAspectRatio="xMidYMid slice" opacity={0.3} />
          <Rect x={0} y={0} width={BW} height={BH} fill="none" stroke="#b9c8e6" strokeWidth={3} />
          {PIECES.map((pc) => (
            <Polygon key={pc.id} points={ptsStr(pc.pts)} fill="none" stroke="#ffffff" strokeWidth={2} />
          ))}
        </Svg>
      ) : null}

      {layout && posRef.current
        ? PIECES.map((pc, i) => {
            const p = posRef.current[i];
            return (
              <View
                key={pc.id}
                {...responders[i].panHandlers}
                style={[styles.piece, { left: p.x, top: p.y, width: pc.w, height: pc.h }]}
              >
                <Svg width={pc.w} height={pc.h} viewBox={`0 0 ${pc.w} ${pc.h}`}>
                  <Defs>
                    <ClipPath id={`clip-${pc.id}`}>
                      <Polygon points={ptsStr(pc.local)} />
                    </ClipPath>
                  </Defs>
                  <SvgImage
                    href={FRAME}
                    x={-pc.home.x}
                    y={-pc.home.y}
                    width={BW}
                    height={BH}
                    preserveAspectRatio="xMidYMid slice"
                    clipPath={`url(#clip-${pc.id})`}
                  />
                  <Polygon points={ptsStr(pc.local)} fill="none" stroke="#ffffff" strokeWidth={3} />
                </Svg>
              </View>
            );
          })
        : null}

      <TouchableOpacity style={styles.skip} onPress={onDone}>
        <Text style={styles.skipText}>건너뛰기</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#f4f7fe',
  },
  board: {
    position: 'absolute',
  },
  piece: {
    position: 'absolute',
    zIndex: 4,
  },
  topic: {
    position: 'absolute',
    top: 22,
    alignSelf: 'center',
    zIndex: 6,
    paddingVertical: 12,
    paddingHorizontal: 26,
    borderRadius: 999,
    backgroundColor: '#eef2ff',
    borderWidth: 1.5,
    borderColor: '#7c93f5',
  },
  topicText: {
    color: '#3a52c4',
    fontSize: 22,
    fontWeight: '900',
  },
  skip: {
    position: 'absolute',
    right: 34,
    bottom: 30,
    zIndex: 6,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dfe8f7',
  },
  skipText: {
    color: '#3a52c4',
    fontSize: 16,
    fontWeight: '900',
  },
});
