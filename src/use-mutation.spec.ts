import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { defineComponent } from 'vue'
import type { GlobalMountOptions } from 'node_modules/@vue/test-utils/dist/types'
import { delay, runTimers } from '../test/utils'
import type { UseMutationOptions } from './use-mutation'
import { useMutation } from './use-mutation'
import { QueryPlugin } from './query-plugin'

describe('useMutation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  function mountSimple<TResult = number, TParams = void>(
    options: Partial<UseMutationOptions<TResult, TParams>> = {},
    mountOptions?: GlobalMountOptions,
  ) {
    const mutation = options.mutation
      ? vi.fn(options.mutation)
      : vi.fn(async () => {
          await delay(0)
          return 42
        })
    const wrapper = mount(
      defineComponent({
        render: () => null,
        setup() {
          return {
            ...useMutation<TResult, TParams>({
              ...options,
              // @ts-expect-error: generic unmatched but types work
              mutation,
            }),
          }
        },
      }),
      {
        global: {
          plugins: [createPinia(), QueryPlugin],
          ...mountOptions,
        },
      },
    )
    return Object.assign([wrapper, mutation] as const, { wrapper, mutation })
  }

  it('invokes the mutation', async () => {
    const { wrapper } = mountSimple()

    wrapper.vm.mutate()
    await runTimers()

    expect(wrapper.vm.data).toBe(42)
  })

  it('can be awaited with mutateAsync', async () => {
    const { wrapper } = mountSimple()

    const p = wrapper.vm.mutateAsync()
    await runTimers()
    await expect(p).resolves.toBe(42)
  })

  it('mutateAsync throws', async () => {
    const { wrapper } = mountSimple({
      mutation: async () => {
        throw new Error('foobar')
      },
    })

    await expect(wrapper.vm.mutateAsync()).rejects.toThrow('foobar')
  })

  it('mutate catches if mutation throws', async () => {
    const { wrapper } = mountSimple({
      mutation: async () => {
        throw new Error('foobar')
      },
    })

    expect((async () => wrapper.vm.mutate())()).resolves.toBeUndefined()
    await runTimers()
    expect(wrapper.vm.error).toEqual(new Error('foobar'))
  })

  it('invokes the "onMutate" hook before mutating', async () => {
    const onMutate = vi.fn()
    const { wrapper } = mountSimple({
      mutation: async ({ a, b }: { a: number, b: number }) => {
        return a + b
      },
      onMutate,
    })
    expect(onMutate).not.toHaveBeenCalled()
    wrapper.vm.mutate({ a: 24, b: 42 })
    expect(onMutate).toHaveBeenCalledTimes(1)
    expect(onMutate).toHaveBeenLastCalledWith({ a: 24, b: 42 })
    wrapper.vm.mutateAsync({ a: 0, b: 1 })
    expect(onMutate).toHaveBeenCalledTimes(2)
    expect(onMutate).toHaveBeenLastCalledWith({ a: 0, b: 1 })
  })

  it('invokes the "onError" hook if mutation throws', async () => {
    const onError = vi.fn()
    const { wrapper } = mountSimple({
      mutation: async (n: number) => {
        throw new Error(String(n))
      },
      onError,
    })

    expect(onError).not.toHaveBeenCalled()
    wrapper.vm.mutate(24)
    await runTimers()
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        error: new Error('24'),
        vars: 24,
      }),
    )
  })

  it('invokes the "onError" hook if onMutate throws', async () => {
    const onError = vi.fn()
    const { wrapper } = mountSimple({
      onMutate() {
        throw new Error('onMutate')
      },
      onError,
    })

    wrapper.vm.mutate()
    await runTimers(false)
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        error: new Error('onMutate'),
        vars: undefined,
      }),
    )
  })

  it('invokes the "onSuccess" hook', async () => {
    const onSuccess = vi.fn()
    const { wrapper } = mountSimple({
      onSuccess,
    })

    wrapper.vm.mutate()
    await runTimers()
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        data: 42,
        vars: undefined,
      }),
    )
  })

  describe('invokes the "onSettled" hook', () => {
    it('on success', async () => {
      const onSettled = vi.fn()
      const { wrapper } = mountSimple({
        onSettled,
      })

      wrapper.vm.mutate()
      await runTimers()
      expect(onSettled).toHaveBeenCalledWith(
        expect.objectContaining({
          error: undefined,
          data: 42,
          vars: undefined,
        }),
      )
    })

    it('on error', async () => {
      const onSettled = vi.fn()
      const { wrapper } = mountSimple({
        mutation: async () => {
          throw new Error('foobar')
        },
        onSettled,
      })

      expect(wrapper.vm.mutateAsync()).rejects.toThrow()
      await runTimers()
      expect(onSettled).toHaveBeenCalledWith(
        expect.objectContaining({
          error: new Error('foobar'),
          data: undefined,
          vars: undefined,
        }),
      )
    })
  })
})
