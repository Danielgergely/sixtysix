import { Color, DoubleSide, ShaderMaterial } from 'three'
import { bend } from './curve'

/**
 * The parted sea's walls of water (Exodus 14:22): deep blue at the foot,
 * turquoise towards the top, light rippling through, fish drifting inside,
 * foam along the crest and at the foot. One shader for the side walls and
 * the walls' end faces; it bends with the curved world. Patterns are laid
 * out along the track (`uDist`), so they stay put while the walls go by.
 */

export const WALL_H = 15

export const seaUniforms = {
  uTime: { value: 0 },
  uDist: { value: 0 },
}

export function waterMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    side: DoubleSide,
    fog: false,
    uniforms: {
      uTime: seaUniforms.uTime,
      uDist: seaUniforms.uDist,
      uBendDown: bend.down,
      uBendSide: bend.side,
      uDeep: { value: new Color('#0a3566') },
      uMid: { value: new Color('#1782ad') },
      uTop: { value: new Color('#6fe3dc') },
      uFog: { value: new Color('#f6d7a4') },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uDist;
      uniform float uBendDown;
      uniform float uBendSide;
      varying vec3 vW;
      varying float vAhead;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        float along = uDist - wp.z + abs(wp.x);
        // The crest rolls a little.
        if (position.y > 0.5) wp.y += sin(along * 0.35 + uTime * 1.6) * 0.35 + sin(along * 0.9 - uTime * 2.3) * 0.15;
        vW = vec3(wp.x, wp.y, along);
        float ahead = max(4.0 - wp.z, 0.0);
        vAhead = ahead;
        wp.y -= uBendDown * ahead * ahead;
        wp.x += uBendSide * ahead * ahead;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uDeep;
      uniform vec3 uMid;
      uniform vec3 uTop;
      uniform vec3 uFog;
      varying vec3 vW;
      varying float vAhead;
      const float H = ${WALL_H.toFixed(1)};

      float fish(vec2 p) {
        // A body (ellipse) and a tail (triangle-ish), facing −x.
        float body = length(p * vec2(1.0, 2.6)) - 0.5;
        vec2 t = p - vec2(0.62, 0.0);
        float tail = max(abs(t.y) - (t.x) * 0.9, t.x - 0.32);
        return min(body, max(tail, -t.x));
      }

      void main() {
        float h = clamp(vW.y / H, 0.0, 1.0);
        float s = vW.z;
        vec3 col = mix(uDeep, uMid, smoothstep(0.0, 0.7, h));
        col = mix(col, uTop, smoothstep(0.6, 1.0, h));
        // Light through the water: a moving web of caustics, brighter near the top.
        float c1 = sin(s * 0.55 + sin(vW.y * 0.45 + uTime * 0.7) * 1.6 + uTime * 0.9);
        float c2 = sin(vW.y * 0.8 - uTime * 0.6 + sin(s * 0.33 - uTime * 0.4) * 1.8);
        float caustic = pow(1.0 - abs(c1 * c2), 7.0);
        float c3 = sin(s * 1.9 + sin(vW.y * 1.4 - uTime * 1.1) * 1.3 - uTime * 1.3);
        float c4 = sin(vW.y * 2.2 + uTime * 0.9 + sin(s * 1.1 + uTime * 0.5) * 1.5);
        float fine = pow(1.0 - abs(c3 * c4), 9.0);
        col += vec3(0.55, 0.9, 0.95) * (caustic * (0.1 + 0.3 * h) + fine * (0.06 + 0.2 * h));
        // Shafts of light from the surface.
        col += vec3(0.5, 0.8, 0.85) * smoothstep(0.75, 1.0, sin(s * 0.42 + sin(uTime * 0.3 + s * 0.05) * 2.0)) * h * h * 0.18;
        // Vertical sheen.
        col += vec3(0.08, 0.14, 0.16) * smoothstep(0.7, 1.0, sin(s * 1.7 + sin(s * 0.21) * 3.0));
        // Fish: a few schools drifting along the wall, dark silhouettes.
        for (int i = 0; i < 3; i++) {
          float fi = float(i);
          float speed = 1.4 + fi * 0.7;
          float cell = 11.0 + fi * 5.0;
          float x = s + uTime * speed + fi * 3.7;
          float id = floor(x / cell);
          float rnd = fract(sin(id * 91.7 + fi * 13.1) * 43758.5);
          vec2 p = vec2(mod(x, cell) - cell * 0.5, vW.y - (2.5 + rnd * 9.0) - sin(uTime * 1.3 + id) * 0.3);
          float scale = 0.8 + fi * 0.45;
          float d = fish(p / scale);
          float depth = 0.45 + 0.2 * fi;
          col = mix(col, uDeep * 0.4, smoothstep(0.06, -0.04, d) * depth * step(0.2, rnd));
        }
        // Foam: a band along the crest and where the wall meets the ground, each with a broken fringe
        // of lace that drifts (two sines multiplied: blobs, a third to break their rows), and a bright line at the very foot.
        float lace = sin(s * 5.3 + uTime * 1.7) * sin(vW.y * 6.1 - uTime * 2.4 + sin(s * 2.3) * 1.5) + sin(s * 11.7 - uTime * 2.1 + vW.y * 3.3) * 0.3;
        float crestY = vW.y + sin(s * 2.1 + uTime * 3.0) * 0.25;
        float crest = smoothstep(H - 1.2, H - 0.2, crestY) * 0.85;
        crest = max(crest, smoothstep(H - 2.8, H - 1.0, crestY) * smoothstep(0.15, 0.6, lace) * 0.6);
        // (The foot's band laps up and down along the wall.)
        float footY = vW.y + sin(s * 1.3 - uTime * 2.0) * 0.2 - abs(sin(s * 0.9 + uTime * 0.8)) * 0.35;
        float foot = smoothstep(0.9, 0.0, footY) * 0.8;
        foot = max(foot, smoothstep(2.4, 0.7, footY) * smoothstep(0.2, 0.65, lace) * 0.55);
        foot = max(foot, smoothstep(0.32, 0.12, vW.y));
        float foam = max(crest, foot);
        col = mix(col, vec3(0.93, 0.98, 1.0), foam);
        // Haze far ahead, like the scene's fog.
        float fog = smoothstep(90.0, 230.0, vAhead);
        col = mix(col, uFog, fog * 0.85);
        gl_FragColor = vec4(col, max(mix(0.88, 0.97, h), foam));
        #include <colorspace_fragment>
      }
    `,
  })
}
