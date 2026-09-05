// src/AI/v2/greennodeAdapter.js

export async function createQueryPlanFromGreenNode(
  question
) {
  const response = await fetch(
    'http://localhost:3001/api/ai/query-plan',
    {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
      },

      body: JSON.stringify({
        question,
      }),
    }
  )

  const data = await response.json()

  if (!response.ok || !data.success) {
    throw new Error(
      data.error ||
      'Không thể tạo Query Plan từ GreenNode.'
    )
  }

  if (!data.queryPlan) {
    throw new Error(
      'GreenNode không trả về Query Plan.'
    )
  }

  return data.queryPlan
}