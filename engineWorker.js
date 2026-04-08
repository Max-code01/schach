/* ===== MAX-GROSSMEISTER-ENGINE V4 (ULTIMATE EDITION) ===== */

// 1. MATERIAL-WERTE
const VALUE = { 
    'p': 100, 'n': 320, 'b': 330, 'r': 500, 'q': 900, 'k': 20000,
    'P': 100, 'N': 320, 'B': 330, 'R': 500, 'Q': 900, 'K': 20000 
};

// 2. ERÖFFNUNGS-BIBLIOTHEK (FEN-basiert)
const OPENING_BOOK = {
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR": ["e2e4", "d2d4", "g1f3"],
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR": ["e7e5", "c7c5"],
    "rnbqkbnr/pppppppp/8/8/3P4/8/PPPP1PPP/RNBQKBNR": ["d7d5", "g8f6"]
};

// 3. TRANSPOSTION TABLE (Das "Gedächtnis" des Bots)
const transpositionTable = new Map();

// 4. POSITIONAL BONI (PST) - Bleibt erhalten für Profi-Positionierung
const PST = {
    'P': [[0,0,0,0,0,0,0,0],[50,50,50,50,50,50,50,50],[10,10,20,30,30,20,10,10],[5,5,10,25,27,10,5,5],[0,0,0,25,25,0,0,0],[5,-5,-10,0,0,-10,-5,5],[5,10,10,-20,-20,10,10,5],[0,0,0,0,0,0,0,0]],
    'N': [[-50,-40,-30,-30,-30,-30,-40,-50],[-40,-20,0,5,5,0,-20,-40],[-30,5,10,15,15,10,5,-30],[-30,0,15,20,20,15,0,-30],[-30,5,15,20,20,15,5,-30],[-30,0,10,15,15,10,0,-30],[-40,-20,0,0,0,0,-20,-40],[-50,-40,-30,-30,-30,-30,-40,-50]],
    'K': [[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-20,-30,-30,-40,-40,-30,-30,-20],[-10,-20,-20,-20,-20,-20,-20,-10],[20,20,0,0,0,0,20,20],[20,30,10,0,0,10,30,20]]
};

// --- DEINE ORIGINAL-FUNKTIONEN (NICHT GEÄNDERT ODER GELÖSCHT) ---

function cloneBoard(board) { return board.map(r => [...r]); }

function isOwn(p, turn) {
    if (!p) return false;
    return turn === "white" ? p === p.toUpperCase() : p === p.toLowerCase();
}

function canMoveSimple(board, fr, fc, tr, tc, turn) {
    const p = board[fr][fc];
    const t = board[tr][tc];
    if (t && isOwn(t, turn)) return false;
    const dr = tr - fr; const dc = tc - fc;
    const ar = Math.abs(dr); const ac = Math.abs(dc);
    const type = p.toLowerCase();
    if (type === 'p') {
        const dir = p === 'P' ? -1 : 1;
        if (dc === 0 && dr === dir && !t) return true;
        if (dc === 0 && dr === 2 * dir && !t && board[fr + dir][fc] === "" && (p === 'P' ? fr === 6 : fr === 1)) return true;
        if (ac === 1 && dr === dir && t) return true;
        return false;
    }
    if (type === 'r') return (fr === tr || fc === tc) && isPathClear(board, fr, fc, tr, tc);
    if (type === 'b') return ar === ac && isPathClear(board, fr, fc, tr, tc);
    if (type === 'q') return (fr === tr || fc === tc || ar === ac) && isPathClear(board, fr, fc, tr, tc);
    if (type === 'n') return (ar === 2 && ac === 1) || (ar === 1 && ac === 2);
    if (type === 'k') return ar <= 1 && ac <= 1;
    return false;
}

function isPathClear(board, fr, fc, tr, tc) {
    const dr = Math.sign(tr - fr); const dc = Math.sign(tc - fc);
    let r = fr + dr; let c = fc + dc;
    while (r !== tr || c !== tc) { if (board[r][c] !== "") return false; r += dr; c += dc; }
    return true;
}

// --- NEUE SICHERHEITS-PRÜFUNGEN (EINGEBAUT WIE BESPROCHEN) ---

function isSafeMove(fr, fc, tr, tc, board, turn) {
    const backupPiece = board[tr][tc];
    const piece = board[fr][fc];
    
    // Zug simulieren
    board[tr][tc] = piece;
    board[fr][fc] = "";
    
    let kingPos = null;
    const targetKing = (turn === "white" ? "K" : "k");
    
    // König finden
    for(let r=0; r<8; r++) {
        for(let c=0; c<8; c++) {
            if(board[r][c] === targetKing) {
                kingPos = {r, c};
                break;
            }
        }
        if(kingPos) break;
    }

    const opponent = (turn === "white" ? "black" : "white");
    let safe = true;
    
    // Wenn König gefunden, prüfe ob er angegriffen wird
    if (kingPos && isAttacked(kingPos.r, kingPos.c, opponent, board)) {
        safe = false;
    }

    // Zug rückgängig machen
    board[fr][fc] = piece;
    board[tr][tc] = backupPiece;
    
    return safe;
}

function isAttacked(tr, tc, attackerColor, b) {
    for(let r=0; r<8; r++) {
        for(let c=0; c<8; c++) {
            if(b[r][c] && isOwn(b[r][c], attackerColor)) {
                if(canMoveSimple(b, r, c, tr, tc, attackerColor)) return true;
            }
        }
    }
    return false;
}

// --- NEUE PROFI-SYSTEME (ERWEITERUNG) ---

function evaluate(board) {
    let score = 0;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (p) {
                const type = p.toUpperCase();
                let val = VALUE[p] || 0;
                const pr = p === type ? r : 7 - r;
                if (PST[type]) val += PST[type][pr][c];
                score += (p === type ? 1 : -1) * val;
            }
        }
    }
    return score;
}

// RUHESUCHE: Rechnet Schlagabtausche zu Ende
function quiescence(board, alpha, beta, maximizing, turn) {
    let standPat = evaluate(board);
    if (maximizing) {
        if (standPat >= beta) return beta;
        if (alpha < standPat) alpha = standPat;
    } else {
        if (standPat <= alpha) return alpha;
        if (beta > standPat) beta = standPat;
    }
    const moves = generateMoves(board, turn).filter(m => m.priority > 0);
    for (const m of moves) {
        const b2 = makeMove(board, m);
        const score = quiescence(b2, alpha, beta, !maximizing, turn === "white" ? "black" : "white");
        if (maximizing) {
            alpha = Math.max(alpha, score);
            if (alpha >= beta) break;
        } else {
            beta = Math.min(beta, score);
            if (beta <= alpha) break;
        }
    }
    return maximizing ? alpha : beta;
}

function generateMoves(board, turn) {
    let moves = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (board[r][c] && isOwn(board[r][c], turn)) {
                for (let tr = 0; tr < 8; tr++) {
                    for (let tc = 0; tc < 8; tc++) {
                        // HIER DIE ENTSCHEIDENDE ÄNDERUNG: canMoveSimple UND isSafeMove
                        if (canMoveSimple(board, r, c, tr, tc, turn) && isSafeMove(r, c, tr, tc, board, turn)) {
                            const target = board[tr][tc];
                            let prio = target ? 10 * VALUE[target.toLowerCase()] - VALUE[board[r][c].toLowerCase()] : 0;
                            moves.push({ fr: r, fc: c, tr: tr, tc: tc, priority: prio });
                        }
                    }
                }
            }
        }
    }
    return moves.sort((a, b) => b.priority - a.priority);
}

function makeMove(board, m) {
    const b2 = cloneBoard(board);
    b2[m.tr][m.tc] = b2[m.fr][m.fc];
    b2[m.fr][m.fc] = "";
    if (b2[m.tr][m.tc] === 'P' && m.tr === 0) b2[m.tr][m.tc] = 'Q';
    if (b2[m.tr][m.tc] === 'p' && m.tr === 7) b2[m.tr][m.tc] = 'q';
    return b2;
}

function alphaBeta(board, depth, alpha, beta, maximizing, turn) {
    // Gedächtnis-Check (Transposition Table)
    const boardKey = board.flat().join('');
    if (transpositionTable.has(boardKey + depth)) return transpositionTable.get(boardKey + depth);

    if (depth === 0) return quiescence(board, alpha, beta, maximizing, turn);
    
    const moves = generateMoves(board, turn);
    if (moves.length === 0) return maximizing ? -1000000 : 1000000;

    let evalRes;
    if (maximizing) {
        let maxEval = -Infinity;
        for (const m of moves) {
            const ev = alphaBeta(makeMove(board, m), depth - 1, alpha, beta, false, "black");
            maxEval = Math.max(maxEval, ev);
            alpha = Math.max(alpha, ev);
            if (beta <= alpha) break;
        }
        evalRes = maxEval;
    } else {
        let minEval = Infinity;
        for (const m of moves) {
            const ev = alphaBeta(makeMove(board, m), depth - 1, alpha, beta, true, "white");
            minEval = Math.min(minEval, ev);
            beta = Math.min(beta, ev);
            if (beta <= alpha) break;
        }
        evalRes = minEval;
    }
    
    transpositionTable.set(boardKey + depth, evalRes);
    return evalRes;
}

// HAUPT-LOGIK
onmessage = function(e) {
    const { board, turn, fen } = e.data;

    // 1. Eröffnungsbuch
    const cleanFen = fen ? fen.split(' ')[0] : null;
    if (cleanFen && OPENING_BOOK[cleanFen]) {
        const bookMoves = OPENING_BOOK[cleanFen];
        const move = bookMoves[Math.floor(Math.random() * bookMoves.length)];
        const cols = "abcdefgh";
        postMessage({
            fr: 8 - parseInt(move[1]), fc: cols.indexOf(move[0]),
            tr: 8 - parseInt(move[3]), tc: cols.indexOf(move[2])
        });
        return;
    }

    const moves = generateMoves(board, turn);
    if (moves.length === 0) { postMessage(null); return; }

    let bestMove = moves[0];
    let bestScore = turn === "white" ? -Infinity : Infinity;

    // Wir leeren das Gedächtnis bei jedem neuen Zug, um Platz zu sparen
    transpositionTable.clear();

    for (const m of moves) {
        const score = alphaBeta(makeMove(board, m), 4, -Infinity, Infinity, turn !== "white", turn === "white" ? "black" : "white");
        if (turn === "white" ? score > bestScore : score < bestScore) {
            bestScore = score;
            bestMove = m;
        }
    }
    postMessage(bestMove);
};
// --- DIESER TEIL IST FÜR DEN GHOST-PLAYER WICHTIG ---
if (typeof module !== 'undefined' && module.exports) {
    // Wir exportieren alles, was der Bot zum Rechnen braucht
    module.exports = { 
        generateMoves, 
        makeMove, 
        isSafeMove, 
        canMoveSimple, 
        isOwn, 
        cloneBoard,
        VALUE, 
        PST 
    };
}
