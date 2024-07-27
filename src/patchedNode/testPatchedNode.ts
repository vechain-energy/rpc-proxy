export async function testPatchedNode(nodeUrl: string): Promise<boolean> {
    try {
        const [testLog] = await fetch(`${nodeUrl}/logs/event`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json'
            },
            body: JSON.stringify({

                "options": { "offset": 0, "limit": 1 },
                "criteriaSet": [{ "address": "0x0000000000000000000000000000456E65726779" }]
            })
        }).then(res => res.json())

        return ('logIndex' in testLog.meta && 'transactionIndex' in testLog.meta)
    }
    catch {
        return false
    }
}
