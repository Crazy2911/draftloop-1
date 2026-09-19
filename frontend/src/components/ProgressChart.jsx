import { useId, useMemo, useState } from "react";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import StatusMessage from "./StatusMessage";

function formatScore(value) {
  return Number.isFinite(value)
    ? value.toLocaleString(undefined, {
        maximumFractionDigits: 2,
      })
    : "Not available";
}

function validScore(value, maximum) {
  return (
    Number.isFinite(value) &&
    value >= 0 &&
    value <= maximum
  );
}

export default function ProgressChart({ progress }) {
  const headingId = useId();
  const selectId = useId();
  const descriptionId = useId();

  const [selectedMetric, setSelectedMetric] = useState("overall");

  const categories = progress?.rubric?.categories ?? [];

  // Fall back to overall if this selection belongs to another rubric.
  const selectedCategory = categories.find(
    (category) => `category:${category.id}` === selectedMetric,
  );

  const overall = !selectedCategory;

  const maximum = overall
    ? categories.reduce(
        (sum, category) => sum + category.max_points,
        0,
      )
    : selectedCategory.max_points;

  const metricLabel = overall
    ? "Overall score"
    : selectedCategory.name;

  const categoryId = selectedCategory?.id;

  const chartData = useMemo(() => {
    const points = progress?.points ?? [];

    return [...points]
      .sort((a, b) => a.draft_number - b.draft_number)
      .map((point) => {
        const categoryScore = point.category_scores?.find(
          (score) => score.category_id === categoryId,
        );

        const aiValue = overall
          ? point.ai_total
          : categoryScore?.score;

        const teacherValue = overall
          ? point.teacher_total
          : null;

        return {
          draftId: point.draft_id,
          draftNumber: point.draft_number,
          label: `Draft ${point.draft_number}`,
          status: point.status,
          ai: validScore(aiValue, maximum) ? aiValue : null,
          teacher: validScore(teacherValue, maximum)
            ? teacherValue
            : null,
        };
      });
  }, [progress, categoryId, overall, maximum]);

  if (!progress || categories.length === 0) {
    return (
      <StatusMessage
        type="empty"
        title="Select an essay"
        message="Choose an essay to view progress across its drafts."
      />
    );
  }

  if (chartData.length === 0) {
    return (
      <StatusMessage
        type="empty"
        title="No drafts yet"
        message="Save and grade a draft to start tracking progress."
      />
    );
  }

  const hasAIScores = chartData.some(
    (point) => point.ai !== null,
  );

  const hasTeacherScores =
    overall &&
    chartData.some((point) => point.teacher !== null);

  const gradedCount = chartData.filter(
    (point) => point.ai !== null,
  ).length;

  return (
    <section
      className="progress-chart"
      aria-labelledby={headingId}
    >
      <div className="section-heading">
        <div>
          <h2 id={headingId}>Progress across drafts</h2>

          <p className="muted">
            {progress.title} · {progress.rubric.name}
          </p>
        </div>

        <div className="form-field">
          <label htmlFor={selectId}>Score to display</label>

          <select
            id={selectId}
            value={
              overall
                ? "overall"
                : `category:${selectedCategory.id}`
            }
            onChange={(event) =>
              setSelectedMetric(event.target.value)
            }
          >
            <option value="overall">Overall score</option>

            {categories.map((category) => (
              <option
                key={category.id}
                value={`category:${category.id}`}
              >
                {category.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p id={descriptionId} className="muted">
        {metricLabel}, out of {formatScore(maximum)} points.
        Missing scores are shown as gaps. Exact values are listed
        in the table below.
      </p>

      {!hasAIScores && !hasTeacherScores ? (
        <StatusMessage
          type="info"
          title="No scores to plot yet"
          message="Grade a saved draft to add its score to this chart."
        />
      ) : (
        <>
          {gradedCount === 1 && (
            <p className="muted">
              One graded draft is available. Grade another draft
              to see how its score changes.
            </p>
          )}

          <div
            className="progress-chart__canvas"
            role="img"
            aria-label={`${metricLabel} across essay drafts`}
            aria-describedby={descriptionId}
          >
            <ResponsiveContainer width="100%" height={320}>
              <LineChart
                data={chartData}
                margin={{
                  top: 20,
                  right: 24,
                  bottom: 10,
                  left: 0,
                }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#cbd5e1"
                />

                <XAxis
                  dataKey="label"
                  stroke="#475569"
                  tick={{ fontSize: 14 }}
                  minTickGap={20}
                />

                <YAxis
                  domain={[0, maximum]}
                  stroke="#475569"
                  tick={{ fontSize: 14 }}
                  tickFormatter={formatScore}
                  width={60}
                />

                <Tooltip
                  formatter={(value, name) => [
                    `${formatScore(value)} / ${formatScore(maximum)}`,
                    name,
                  ]}
                />

                <Legend />

                {hasAIScores && (
                  <Line
                    type="linear"
                    dataKey="ai"
                    name="AI score"
                    stroke="#2563eb"
                    strokeWidth={3}
                    dot={{ r: 5 }}
                    activeDot={{ r: 7 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                )}

                {hasTeacherScores && (
                  <Line
                    type="linear"
                    dataKey="teacher"
                    name="Teacher-reviewed score"
                    stroke="#7c3aed"
                    strokeWidth={3}
                    strokeDasharray="6 4"
                    dot={{ r: 5 }}
                    activeDot={{ r: 7 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      <div
        className="table-scroll"
        role="region"
        aria-label={`${metricLabel} values`}
        tabIndex={0}
      >
        <table className="data-table">
          <caption>
            {metricLabel} — maximum {formatScore(maximum)} points
          </caption>

          <thead>
            <tr>
              <th scope="col">Draft</th>
              <th scope="col">Status</th>
              <th scope="col">AI score</th>
              {overall && (
                <th scope="col">Teacher-reviewed score</th>
              )}
            </tr>
          </thead>

          <tbody>
            {chartData.map((point) => (
              <tr key={point.draftId}>
                <th scope="row">{point.label}</th>

                <td>
                  {point.status === "graded"
                    ? "AI graded"
                    : point.status === "grading"
                      ? "Grading"
                      : point.status === "failed"
                        ? "Grading failed"
                        : "Saved"}
                </td>

                <td>{formatScore(point.ai)}</td>

                {overall && (
                  <td>{formatScore(point.teacher)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="muted">
        Scores reflect assessments of these drafts, not a guaranteed
        measure of learning. Compare the feedback alongside the scores.
      </p>
    </section>
  );
}