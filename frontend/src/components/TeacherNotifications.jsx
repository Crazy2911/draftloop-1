import { useEffect, useState } from "react";
import { Bell } from "lucide-react";

import { supabase } from "../services/supabase";

export default function TeacherNotifications({
  teacherId,
  onOpenSubmission,
}) {
  const [notifications, setNotifications] = useState([]);

    useEffect(() => {
    if (!teacherId) {
      return undefined;
    }

    let active = true;

    async function loadUnreadNotifications() {
      const { data, error } = await supabase
        .from("teacher_notifications")
        .select("*")
        .eq("teacher_id", teacherId)
        .is("read_at", null)
        .order("created_at", {
          ascending: false,
        })
        .limit(20);

      if (active && !error) {
        setNotifications(data || []);
      }
    }

    void loadUnreadNotifications();

    const channel = supabase
      .channel(`teacher-notifications-${teacherId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "teacher_notifications",
          filter: `teacher_id=eq.${teacherId}`,
        },
        (payload) => {
          setNotifications((current) => [
            payload.new,
            ...current,
          ]);
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [teacherId]);

  if (!notifications.length) {
    return null;
  }

  return (
    <section className="card teacher-notifications">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Live updates</p>
          <h3>
            <Bell size={18} aria-hidden="true" />
            New submissions
          </h3>
        </div>

        <span className="status-badge">
          {notifications.length} new
        </span>
      </div>

      <ul className="teacher-notifications__list">
        {notifications.map((notification) => (
          <li key={notification.id}>
            <div>
              <strong>Draft graded</strong>
              <p className="muted">
                A student submission is ready for your review.
              </p>
            </div>

            <button
              type="button"
              className="button button--secondary"
              onClick={async () => {
  await supabase
    .from("teacher_notifications")
    .update({
      read_at: new Date().toISOString(),
    })
    .eq("id", notification.id);

  onOpenSubmission?.(notification.essay_id);

  setNotifications((current) =>
    current.filter(
      (item) => item.id !== notification.id,
    ),
  );
}}
            >
              Review
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}