const getSnapshotsQuery = `
SELECT *
FROM snapshots
WHERE target_date = $1;
`
const topEarnersByType = `
SELECT
  account_id as id,
  account_type as type,
  balance
FROM account_balances
WHERE account_type = $1::text
ORDER BY balance DESC
LIMIT $2;
`
const aggregateVotesQuery = `
SELECT
  COUNT(DISTINCT channel) AS channel,
  SUM(amount) AS amount,
  SUM(fees) AS fees, cohort
FROM votes
GROUP BY cohort;
`
const aggregateTransactionsQuery = `
SELECT
  COUNT(distinct channel) AS channel,
  SUM(amount) AS amount,
  transaction_type AS type
FROM transactions
GROUP BY transaction_type;
`
const insertSnapshotQuery = `
INSERT INTO snapshots (target_date, data)
VALUES ($1, $2);
`
const distinctAccountTypes = `
SELECT distinct account_type as type
FROM account_balances;
`

module.exports = {
  aggregateTransactions,
  aggregateVotes,
  generateSnapshot,
  insertSnapshot,
  getSnapshot
}

async function getSnapshot (runtime, client, options) {
  const { date } = options
  const { rows } = await client.query(getSnapshotsQuery, [date.toISOString()])
  const snapshot = rows[0]
  if (!snapshot) {
    return
  }
  const {
    data,
    created_at: createdAt,
    target_date: targetDate
  } = snapshot
  data.createdAt = createdAt
  data.targetDate = targetDate
  return data
}

async function aggregateTransactions (runtime, client) {
  const { rows } = await client.query(aggregateTransactionsQuery)
  return rows
}

async function aggregateVotes (runtime, client) {
  const { rows } = await client.query(aggregateVotesQuery)
  return rows
}

async function topEarners (runtime, client, options) {
  const { limit } = options
  const { postgres } = runtime
  const { rows: earners } = await postgres.query(distinctAccountTypes)
  const earnersPromises = earners.map(({
    type
  }) => postgres.query(topEarnersByType, [type, limit]).then(({
    rows
  }) => ({ [type]: rows })))
  const results = await Promise.all(earnersPromises)
  return Object.assign({}, ...results)
}

async function generateSnapshot (runtime, client, options) {
  const snapshot = await getSnapshot(runtime, client, options)
  if (snapshot) {
    return
  }
  const votesPromise = aggregateVotes(runtime, client, options)
  const transactionsPromise = aggregateTransactions(runtime, client, options)
  const topPromise = topEarners(runtime, client, {
    limit: 100
  })
  const [
    votes,
    transactions,
    top
  ] = await Promise.all([
    votesPromise,
    transactionsPromise,
    topPromise
  ])
  const data = {
    top,
    votes,
    transactions
  }
  await insertSnapshot(runtime, client, {
    date: options.date,
    data
  })
}

async function insertSnapshot (runtime, client, options) {
  const { date, data } = options
  await client.query(insertSnapshotQuery, [date, data])
}
