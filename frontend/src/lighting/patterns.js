/*
 * The teaching layer (spec §4): classify the key-light position into the
 * classic portrait/cinema patterns, name the ratio's mood, and translate
 * color temperature. Pure functions — no three.js here.
 */

/* Angles are relative to the subject's face (facing +Z, az 0).
   az in degrees [-180, 180], el in degrees. */
export function classifyPattern(az, el) {
  const a = Math.abs(az);

  if (el < -8) {
    return {
      name: 'Uplight',
      note: 'Light from below inverts every natural shadow. Horror, unease, firelight.',
    };
  }
  if (a > 140) {
    return {
      name: 'Backlight',
      note: 'The key becomes a silhouette edge. Mystery — the face is withheld.',
    };
  }
  if (a > 100) {
    return {
      name: 'Kicker',
      note: 'Behind and beside the subject. Carves the jaw and shoulder off the background.',
    };
  }
  if (a > 62) {
    return {
      name: 'Split',
      note: 'Half the face lit, half dark. Duality, conflict, film noir.',
    };
  }
  if (a <= 25 && el > 42) {
    return {
      name: 'Butterfly (Paramount)',
      note: 'High and frontal — a small shadow under the nose. Old-Hollywood glamour.',
    };
  }
  if (a > 38) {
    return {
      name: 'Rembrandt',
      note: 'A triangle of light on the shadow cheek. The painter’s pattern — dramatic, dignified.',
    };
  }
  if (a > 14) {
    return {
      name: 'Loop',
      note: 'The nose shadow loops gently to one side. The everyday flattering key.',
    };
  }
  return {
    name: 'Flat front',
    note: 'On the camera axis — shadowless and open. Honest, but without shape.',
  };
}

/* Broad vs short: does the key light the cheek turned toward camera (broad)
   or away from it (short)? Only meaningful when both are off-axis. */
export function broadOrShort(keyAz, camAz) {
  if (Math.abs(camAz) < 18) return null;
  const a = Math.abs(keyAz);
  if (a < 14 || a > 100) return null;
  return Math.sign(keyAz) === Math.sign(camAz) ? 'broad side' : 'short side';
}

export function ratioLabel(key, fill) {
  const r = key / Math.max(fill, 0.02);
  let nice;
  if (r < 1.25) nice = '1:1';
  else if (r < 1.75) nice = '1.5:1';
  else if (r < 2.5) nice = '2:1';
  else if (r < 3.5) nice = '3:1';
  else if (r < 5) nice = '4:1';
  else if (r < 7) nice = '6:1';
  else if (r < 12) nice = '8:1';
  else nice = '16:1';

  const mood =
    r < 1.75 ? 'high-key, open' :
    r < 3.5 ? 'soft, natural' :
    r < 7 ? 'classic dramatic' :
    'low-key, hard';

  return { ratio: nice, mood, value: r };
}

export function tempLabel(k) {
  if (k < 3200) return 'tungsten warm';
  if (k < 4300) return 'golden hour';
  if (k < 5600) return 'daylight';
  if (k < 7000) return 'overcast cool';
  return 'blue hour';
}

/* Kelvin → linear-ish RGB [0,1]. Standard Tanner Helland approximation. */
export function kelvinToRGB(k) {
  const t = k / 100;
  let r, g, b;
  if (t <= 66) {
    r = 255;
    g = 99.47 * Math.log(t) - 161.12;
  } else {
    r = 329.7 * Math.pow(t - 60, -0.1332);
    g = 288.12 * Math.pow(t - 60, -0.0755);
  }
  if (t >= 66) b = 255;
  else if (t <= 19) b = 0;
  else b = 138.52 * Math.log(t - 10) - 305.04;
  const c = (v) => Math.min(1, Math.max(0, v / 255));
  return [c(r), c(g), c(b)];
}

/* Focal length (full-frame mm) → vertical FOV in degrees. */
export function mmToFov(mm) {
  return (2 * Math.atan(12 / mm) * 180) / Math.PI;
}
