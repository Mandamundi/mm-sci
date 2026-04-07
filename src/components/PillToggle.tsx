import { motion } from 'motion/react';
import { clsx } from 'clsx';

interface PillToggleProps<T extends string> {
  options: T[];
  selected: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  disabledTooltip?: string;
  disabledOptions?: T[];
  layoutId?: string;
}

export function PillToggle<T extends string>({
  options,
  selected,
  onChange,
  disabled,
  disabledTooltip,
  disabledOptions = [],
  layoutId = 'pill-indicator',
}: PillToggleProps<T>) {
  return (
    <div
      className={clsx(
        'flex p-1 bg-gray-100 dark:bg-[#0e0f11] rounded-full border border-gray-200 dark:border-[#2a2d35]',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
      title={disabled ? disabledTooltip : undefined}
    >
      {options.map((option) => {
        const isActive = selected === option;
        const isDisabled = disabled || disabledOptions.includes(option);

        return (
          <button
            key={option}
            disabled={isDisabled}
            onClick={() => !isDisabled && onChange(option)}
            title={isDisabled && !disabled ? disabledTooltip : undefined}
            className={clsx(
              'relative px-3 py-1 text-xs font-medium rounded-full transition-colors z-10',
              isActive
                ? 'text-white'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200',
              isDisabled && 'opacity-40 cursor-not-allowed pointer-events-none'
            )}
          >
            {isActive && (
              <motion.div
                layoutId={layoutId}
                className="absolute inset-0 bg-[#1d9e75] rounded-full -z-10"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
              />
            )}
            {option}
          </button>
        );
      })}
    </div>
  );
}