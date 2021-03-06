import { Controller } from 'egg';
import fs from 'fs';
import path from 'path';
import Judge from '@h2oj/judge';
import Submission from '../model/Submission';
import { TaskStatus } from '../model/Task';

class SubmissionController extends Controller {
    public async list() {
        const { ctx } = this;
        const param = ctx.query;
        const page = param.page || 1;
        const each = param.each || 15;
        let [submissions, length] = await ctx.repo.Submission.findAndCount({
            order: {
                submitTime: 'DESC'
            },
            skip: (page - 1) * each,
            take: each
        });
        
        ctx.helper.response(200, 'processed successfully', {
            count: length,
            page_count: Math.ceil(length / each),
            submissions: await Promise.all(submissions.map(async (submission: Submission) => {
                await submission.loadProblem();
                await submission.loadUser();
                return {
                    submission_id: submission.submissionId,
                    problem_id: submission.problemId,
                    user_id: submission.userId,
                    status: submission.status,
                    score: submission.score,
                    language: submission.language,
                    total_time: submission.time,
                    total_space: submission.space,
                    submit_time: submission.submitTime,
                    problem: {
                        problem_id: submission.problem.problemId,
                        title: submission.problem.title
                    },
                    user: {
                        user_id: submission.user.userId,
                        username: submission.user.username,
                        nickname: submission.user.nickname
                    }
                };
            }))
        });
    }

    public async detail() {
        const { ctx } = this;
        const param = ctx.query;

        const submission = await ctx.repo.Submission.findOne({
            where: { submissionId: param.submission_id }
        });

        if (!submission) {
            ctx.helper.response(2001, 'no data');
            return;
        }

        await submission.loadUser();
        await submission.loadProblem();
        await submission.loadDetail();

        let fileContent = 'unshown';
        if (
            ctx.service.submission.checkLanguageCanShow(submission.language) &&
            (submission.contestId ? !ctx.service.contest.checkContestState(submission.contestId) : false)
        ) {
            const fileExt = ctx.service.submission.getLanguageFileExtension(submission.language);
            const fileName = path.join(ctx.app.config.h2oj.path.code, submission.detail.fileId + '.' + fileExt);
            fileContent = fs.readFileSync(fileName, { encoding: 'utf-8' });
        }

        ctx.helper.response(200, 'processed successfully', {
            submission_id: submission.submissionId,
            problem_id: submission.problemId,
            user_id: submission.userId,
            status: submission.status,
            score: submission.score,
            language: submission.language,
            total_time: submission.time,
            total_space: submission.space,
            submit_time: submission.submitTime,
            detail: submission.detail,
            file_content: fileContent,
            problem: {
                problem_id: submission.problem.problemId,
                title: submission.problem.title
            },
            user: {
                user_id: submission.user.userId,
                username: submission.user.username,
                nickname: submission.user.nickname
            }
        });
    }

    public async submit() {
        const { ctx } = this;
        const {
            language, code, problem_id: problemId,
            contest_id: contestId
        } = ctx.request.body;
        const { user_id: userId } = ctx.state;

        const submitTime = Math.floor(ctx.starttime / 1000);
        if (!ctx.service.submission.checkLanguage(language)) {
            ctx.helper.response(5001, 'unavailable language');
            return;
        }

        if (contestId) {
            if (!ctx.service.contest.checkContestState(contestId)) {
                ctx.helper.response(4003, 'contest not started');
                return;
            }

            if (!ctx.service.contest.checkUserInContest(userId, contestId)) {
                ctx.helper.response(4002, 'haven\'t joined contest');
                return;
            }
        }

        const codeHash = ctx.service.submission.generateCodeHash(code);
        const fileExt = ctx.service.submission.getLanguageFileExtension(language);
        const fileName = codeHash + '.' + fileExt;
        const filePath = path.join(ctx.app.config.h2oj.path.code, fileName);
        fs.writeFileSync(filePath, code);
        
        const workPath = path.join(ctx.app.config.h2oj.path.judge, codeHash);
        if (!fs.existsSync(workPath)) {
            fs.mkdirSync(workPath);
        }
        fs.writeFileSync(path.join(workPath, 'src.' + fileExt), code);

        const submission = await ctx.repo.Submission.create();
        submission.userId = userId;
        submission.problemId = problemId;
        submission.contestId = contestId;
        submission.language = language;
        submission.submitTime = submitTime;
        submission.status = Judge.JudgeStatus.NO_STATUS;
        submission.codeSize = fs.statSync(filePath).size;
        submission.time = 0;
        submission.space = 0;
        await submission.save();

        const submissionDetail = await ctx.repo.SubmissionDetail.create();
        submissionDetail.submissionId = submission.submissionId;
        submissionDetail.fileId = codeHash;
        submissionDetail.testCase = [];
        await submissionDetail.save();

        const task = await ctx.repo.Task.create();
        task.submissionId = submission.submissionId;
        task.problemId = submission.problemId;
        task.time = ctx.helper.getTime();
        task.language = submission.language;
        task.status = TaskStatus.WAITING;
        await task.save();

        const problem = await ctx.repo.Problem.findOne({ where: { problemId: problemId } });
        problem.submitCount += 1;

        const user = await ctx.repo.User.findOne({ where: { userId: userId } });
        user.submitCount += 1;

        ctx.helper.success({
            submission_id: submission.submissionId
        });
    }
}

export default SubmissionController;
