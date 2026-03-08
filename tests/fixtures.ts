export const issueCommentFixture = `
  <div class="timeline-comment-header clearfix d-flex flex-items-start">
    <h3 class="f5 text-normal py-2" style="flex: 1 1 auto">
      <div class="d-flex flex-items-center flex-wrap gap-1">
        <strong>
          <a class="author Link--primary text-bold css-overflow-wrap-anywhere" href="/mchisolm0">mchisolm0</a>
        </strong>
        <span aria-label="Collaborator">
          <span class="Label">Collaborator</span>
        </span>
        commented
        <a href="#issuecomment-1" class="Link--secondary js-timestamp">
          <relative-time datetime="2026-03-07T12:00:00Z">Mar 7, 2026</relative-time>
        </a>
      </div>
    </h3>
  </div>
`;

export const prBodyFixture = `
  <div class="timeline-comment-header clearfix d-flex flex-items-start">
    <h3 class="f5 text-normal py-2" style="flex: 1 1 auto">
      <div class="d-flex flex-items-center flex-wrap gap-1">
        <strong>
          <a class="author Link--primary text-bold css-overflow-wrap-anywhere" href="/octocat">octocat</a>
        </strong>
        opened this pull request
        <a href="#issuecomment-2" class="Link--secondary js-timestamp">
          <relative-time datetime="2026-03-07T13:00:00Z">Mar 7, 2026</relative-time>
        </a>
      </div>
    </h3>
  </div>
`;

export const reviewCommentFixture = `
  <div class="timeline-comment-header clearfix d-flex flex-items-start">
    <h3 class="f5 text-normal py-2" style="flex: 1 1 auto">
      <div class="d-flex flex-items-center flex-wrap gap-1">
        <strong>
          <a class="author Link--primary text-bold css-overflow-wrap-anywhere" href="/reviewer">reviewer</a>
        </strong>
        reviewed
        <a href="#issuecomment-3" class="Link--secondary js-timestamp">
          <relative-time datetime="2026-03-07T14:00:00Z">Mar 7, 2026</relative-time>
        </a>
      </div>
    </h3>
  </div>
`;

export const dynamicCommentFixture = `
  <div class="timeline-comment-header clearfix d-flex flex-items-start">
    <h3 class="f5 text-normal py-2" style="flex: 1 1 auto">
      <div class="d-flex flex-items-center flex-wrap gap-1">
        <strong>
          <a class="author Link--primary text-bold css-overflow-wrap-anywhere" href="/latecomer">latecomer</a>
        </strong>
        commented
        <a href="#issuecomment-4" class="Link--secondary js-timestamp">
          <relative-time datetime="2026-03-07T15:00:00Z">Mar 7, 2026</relative-time>
        </a>
      </div>
    </h3>
  </div>
`;

export const modernIssueHeaderFixture = `
  <div class="IssueBodyHeader-module__IssueBodyHeaderContainer__SrDB7 IssueBodyHeader-module__viewerDidNotAuthor__vD8tZ">
    <div class="ActivityHeader-module__activityHeader__ZGlyB IssueBodyHeader-module__activityHeaderWrapper__nrxjr">
      <div class="IssueBodyHeader-module__titleSection__dX9cz">
        <a class="IssueBodyHeaderAuthor-module__authorLoginLink__aTls_" href="https://github.com/mchisolm0">mchisolm0</a>
        <a class="IssueBodyHeader-module__dateLink__kYTxQ" href="#issuecomment-5">now</a>
      </div>
    </div>
    <div class="IssueBodyHeader-module__badgesSection___PWtJ">
      <div class="IssueBodyHeader-module__badgeGroup__EPYnd">
        <span class="Label">Member</span>
        <span class="Label">Author</span>
      </div>
    </div>
  </div>
`;
