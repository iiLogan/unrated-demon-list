import { round, score } from "./score.js";

/**
 * Path to directory containing `_list.json` and all levels
 */
const dir = "/data";

/**
 * Symbol, that marks a level as not part of the list
 */
const benchmarker = "_";

export async function fetchList() {
    const listResult = await fetch(`${dir}/_list.json`);
    try {
        const list = await listResult.json();

        // Create a lookup dictionary for ranks
        const ranksEntries = list
            .filter((path) => !path.startsWith(benchmarker))
            .map((path, index) => [path, index + 1]);
        const ranks = Object.fromEntries(ranksEntries);

        return await Promise.all(
            list.map(async (path) => {
                const rank = ranks[path] || null;
                try {
                    const levelResult = await fetch(
                        `${dir}/${path.startsWith(benchmarker) ? path.substring(1) : path}.json`,
                    );
                    const level = await levelResult.json();
                    return [
                        null,
                        rank,
                        {
                            ...level,
                            rank,
                            path,
                            records: level.records.sort(
                                (a, b) => b.percent - a.percent,
                            ),
                        },
                    ];
                } catch {
                    console.error(`Failed to load level #${rank} ${path}.`);
                    return [path, rank, null];
                }
            }),
        );
    } catch {
        console.error(`Failed to load list.`);
        return null;
    }
}

export async function fetchEditors() {
    try {
        const editorsResults = await fetch(`${dir}/_editors.json`);
        const editors = await editorsResults.json();
        return editors;
    } catch {
        return null;
    }
}

export async function fetchLeaderboard() {
    const list = await fetchList();

    const scoreMap = {};
    const errs = [];

    if (list === null) {
        return [null, ["Failed to load list."]];
    }
    let listbans = null;
    try {
        const listbanResults = await fetch(`${dir}/_lbfilter.json`);
        listbans = await listbanResults.json();
    } catch {
        return [null, ["Failed to load bans list."]];
    }
    let lenlist = list.filter((x) => x[2]["rank"] !== null).length;

    list.forEach(([err, rank, level]) => {
        if (err) {
            errs.push(err);
            return;
        }

        if (rank === null) {
            return;
        }

        // Verification
        const verifier =
            Object.keys(scoreMap).find(
                (u) => u.toLowerCase() === level.verifier.toLowerCase(),
            ) || level.verifier;
        if (!listbans.includes(verifier)) {
            scoreMap[verifier] ??= {
                verified: [],
                completed: [],
                progressed: [],
            };
            const { verified } = scoreMap[verifier];
            verified.push({
                rank,
                level: level.name,
                score: score(rank, 100, level.percentToQualify, lenlist),
                link: level.verification,
            });
        }

        // Records
        level.records.forEach((record) => {
            const user =
                Object.keys(scoreMap).find(
                    (u) => u.toLowerCase() === record.user.toLowerCase(),
                ) || record.user;
            if (listbans.includes(user)) {
                return;
            }
            scoreMap[user] ??= {
                verified: [],
                completed: [],
                progressed: [],
            };
            const { completed, progressed } = scoreMap[user];
            if (record.percent === 100) {
                completed.push({
                    rank,
                    level: level.name,
                    score: score(rank, 100, level.percentToQualify, lenlist),
                    link: record.link,
                });
                return;
            }

            progressed.push({
                rank,
                level: level.name,
                percent: record.percent,
                score: score(
                    rank,
                    record.percent,
                    level.percentToQualify,
                    lenlist,
                ),
                link: record.link,
            });
        });
    });

    // Wrap in extra Object containing the user and total score
    const res = Object.entries(scoreMap).map(([user, scores]) => {
        const { verified, completed, progressed } = scores;
        const total = [verified, completed, progressed]
            .flat()
            .reduce((prev, cur) => prev + cur.score, 0);

        return {
            user,
            total: round(total),
            ...scores,
        };
    });

    // Sort by total score
    return [res.sort((a, b) => b.total - a.total), errs];
}
