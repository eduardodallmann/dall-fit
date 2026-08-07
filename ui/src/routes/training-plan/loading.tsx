import { Skeleton } from '@heroui/react';

import { trainingPlanStyles } from '~/routes/training-plan/styles';

const styles = trainingPlanStyles();

export function TrainingPlanPageSkeleton({
  label,
}: Readonly<{ label: string }>) {
  return (
    <div aria-label={label} className={styles.pageSkeleton()} role="status">
      <span className={styles.srOnly()}>{label}</span>
      <div className={styles.skeletonHeader()}>
        <div className={styles.skeletonTextGroup()}>
          <Skeleton className={styles.skeletonTitle()} />
          <Skeleton className={styles.skeletonDescription()} />
        </div>
        <Skeleton className={styles.skeletonAction()} />
      </div>
      <div className={styles.skeletonSection()}>
        <Skeleton className={styles.skeletonSubtitle()} />
        <Skeleton className={styles.skeletonDescription()} />
        <TrainingPlanTableLoading columnCount={3} label="Carregando tabela" />
      </div>
    </div>
  );
}

export function TrainingPlanTableLoading({
  columnCount,
  label,
}: Readonly<{ columnCount: number; label: string }>) {
  return (
    <div aria-label={label} className={styles.tableSkeleton()} role="status">
      <span className={styles.srOnly()}>{label}</span>
      {Array.from({ length: 3 }, (_, rowIndex) => (
        <div className={styles.tableSkeletonRow()} key={rowIndex}>
          {Array.from({ length: columnCount }, (_, columnIndex) => (
            <Skeleton className={styles.skeletonCell()} key={columnIndex} />
          ))}
        </div>
      ))}
    </div>
  );
}
