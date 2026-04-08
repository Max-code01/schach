// effects.glsl - MAXIMALE VOLLVERSION (Nr. 18)
precision highp float;

uniform float time;
uniform vec2 resolution;

// Funktion für komplexe Wellen (Fractal-Plasma)
float wave(vec2 p, float t) {
    float v = 0.0;
    v += sin(p.x * 10.0 + t);
    v += sin((p.y + t) * 0.5);
    v += sin((p.x + p.y + t) * 0.5);
    p += vec2(sin(t * 0.3), cos(t * 0.2)) * 5.0;
    v += sin(sqrt(p.x*p.x + p.y*p.y + 1.0) + t);
    return v;
}

void main() {
    // 1. Koordinaten berechnen
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = -1.0 + 2.0 * uv;
    p.x *= resolution.x / resolution.y;

    // 2. Zeitlupe-Effekt für edle Bewegung
    float t = time * 0.4;

    // 3. Drei verschiedene Farbschichten berechnen (RGB-Verschiebung)
    float r = wave(p, t * 1.1);
    float g = wave(p, t * 1.2);
    float b = wave(p, t * 1.3);

    // 4. Deine Design-Farben mischen (Dunkelblau, Elektro-Blau, Violett)
    vec3 color = vec3(0.1 * r, 0.2 * g, 0.5 * b);
    
    // 5. Kontrast verstärken für den "Cyber-Look"
    color = pow(color, vec3(1.5));
    
    // 6. Vignette-Effekt (Ränder dunkler, damit das Schachbrett in der Mitte strahlt)
    float vignette = 1.0 - length(p * 0.5);
    color *= vignette;

    gl_FragColor = vec4(color, 1.0);
}
