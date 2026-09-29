import { z } from "zod";

// JSON columns are read back through lenient schemas. Rows created before a
// field existed get defaults instead of `undefined`, and PII the prompts don't
// need (email, phone, raw resume text) is dropped.

const CandidateProfileSchema = z.object({
    name: z.string().nullable().catch(null),
    experienceYears: z.number().nullable().catch(null),
    skills: z.array(z.string()).catch([]),
    work: z.array(z.string()).catch([]),
    projects: z.array(z.string()).catch([]),
    college: z.array(z.string()).catch([]),
});

const RepoSummarySchema = z.object({
    name: z.string(),
    description: z.string().nullable().catch(null),
    language: z.string().nullable().catch(null),
    starCount: z.number().catch(0),
});

const JobFitSchema = z.object({
    score: z.number(),
    summary: z.string(),
    matchedSignals: z.array(z.string()).catch([]),
    missingSignals: z.array(z.string()).catch([]),
});

export type CandidateProfile = z.infer<typeof CandidateProfileSchema>;
export type RepoSummary = z.infer<typeof RepoSummarySchema>;
export type JobFit = z.infer<typeof JobFitSchema>;

export interface InterviewContext {
    jobDescription: string;
    candidate: CandidateProfile;
    repos: RepoSummary[];
    jobFit: JobFit | null;
}

const EMPTY_PROFILE: CandidateProfile = {
    name: null,
    experienceYears: null,
    skills: [],
    work: [],
    projects: [],
    college: [],
};

export function readInterviewContext(interview: {
    jobDescription: string;
    resumeData: unknown;
    githubMetadata: unknown;
    jdFeedback: unknown;
}): InterviewContext {
    return {
        jobDescription: interview.jobDescription,
        candidate: CandidateProfileSchema.catch(EMPTY_PROFILE).parse(interview.resumeData),
        repos: z.array(RepoSummarySchema).catch([]).parse(interview.githubMetadata),
        jobFit: JobFitSchema.nullable().catch(null).parse(interview.jdFeedback),
    };
}
