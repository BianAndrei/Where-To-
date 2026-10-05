import { useParams, Link, Navigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api, post, ApiError } from "../lib/api";
import { Logo, Doodle } from "../components/Doodle";
import { Button, Notice } from "../components/ui";
import Planner from "./Planner";
export default function Share({ join = false }: { join?: boolean }) {
  const { token } = useParams();
  const query = useQuery({
    queryKey: ["share", token],
    queryFn: () => api(`/share/${token}`),
    enabled: !join,
  });
  const mutation = useMutation({
    mutationFn: () => post(`/join/${token}`, {}),
  });
  if (mutation.isSuccess)
    return <Navigate to={`/app/trips/${mutation.data.tripId}`} />;
  if (mutation.error instanceof ApiError && mutation.error.status === 401)
    return (
      <Navigate to={`/login?next=${encodeURIComponent(`/join/${token}`)}`} />
    );
  if (join)
    return (
      <div className="join-page">
        <Link to="/">
          <Logo />
        </Link>
        <Doodle name="suitcase" colour="#CDE5D4" flow />
        <h1>
          Your next adventure
          <br />
          is better together.
        </h1>
        <p>You’ve been invited to help plan a trip.</p>
        {mutation.error && <Notice error>{mutation.error.message}</Notice>}
        <Button loading={mutation.isPending} onClick={() => mutation.mutate()}>
          Join the planning
        </Button>
      </div>
    );
  if (query.error)
    return (
      <div className="empty">
        <Logo />
        <h1>This link has expired.</h1>
        <p>{query.error.message}</p>
        <Link to="/">Back to Whereto</Link>
      </div>
    );
  if (!query.data)
    return <div className="page-loading">Opening a shared adventure…</div>;
  return <Planner shared={{ ...query.data, token }} />;
}
