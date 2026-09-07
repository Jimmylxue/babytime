import { View, Text, Image, Input, Button } from '@tarojs/components'
import Taro, { useDidShow, useShareAppMessage } from '@tarojs/taro'
import { useState } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useBabyStore } from '../../stores/babyStore'
import { familyApi } from '../../utils/request'
import familyIllustration from '../../assets/family-illustration.jpg'
import personPinkIcon from '../../assets/icons/person-pink.svg'
import logoutWhiteIcon from '../../assets/icons/logout-white.svg'
import './index.scss'

definePageConfig({
  navigationStyle: 'custom',
  backgroundColor: '#FEF8F7',
})

interface Member {
  id: string
  userId: string
  babyId: string
  role: string
  status: string
  user?: {
    id: string
    nickname?: string
    avatar?: string
    role?: string
  }
}

interface InviteInfo {
  inviteCode: string
  expiresAt: string
}

const ROLE_MAP: Record<string, string> = {
  father: '爸爸',
  mother: '妈妈',
  grandfather: '爷爷',
  grandmother: '奶奶',
  other: '家人',
  owner: '创建者',
}

export default function FamilyPage() {
  const { userInfo } = useAuthStore()
  const { fetchBabies } = useBabyStore()
  const [members, setMembers] = useState<Member[]>([])
  const [isBound, setIsBound] = useState(false)
  const [isOwner, setIsOwner] = useState(false)

  // Invite & Join state
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null)
  const [inputInviteCode, setInputInviteCode] = useState('')

  // 自定义导航：返回按钮与微信胶囊同带对称
  const [menuBand] = useState(() => {
    let top = (Taro.getSystemInfoSync().statusBarHeight || 20) + 4
    let height = 32
    let leftInset = 10
    try {
      const menu = Taro.getMenuButtonBoundingClientRect()
      if (menu && menu.height) {
        const si = Taro.getSystemInfoSync()
        top = menu.top
        height = menu.height
        leftInset = Math.max(6, si.windowWidth - menu.right)
      }
    } catch (error) {
      // 取不到胶囊信息时用默认值
    }
    return { top, height, leftInset }
  })

  const handleBack = () => {
    const pages = Taro.getCurrentPages()
    if (pages.length > 1) {
      Taro.navigateBack();
    } else {
      Taro.switchTab({ url: '/pages/mine/index' });
    }
  }

  useDidShow(() => {
    init()
  })

  const init = async () => {
    await fetchBabies()
    await loadData()
  }

  const loadData = async () => {
    try {
      const [membersRes, bindingRes] = await Promise.all([
        familyApi.getMembers(),
        familyApi.getBindingStatus(),
      ])
      setMembers(membersRes.data || [])
      const bound = bindingRes.data?.isBound ?? false
      const reason = bindingRes.data?.reason
      setIsBound(bound)
      // 未绑定说明没有家庭成员，自己就是创建者；已绑定且 reason 是 owner 也是创建者
      const owner = !bound || reason === 'owner'
      setIsOwner(owner)
      // 创建者自动准备邀请卡（分享按钮即点即用）
      if (owner) {
        prepareInvite()
      }
    } catch (error) {
      console.error('加载家庭数据失败', error)
    }
  }

  // 生成/复用邀请卡（force=true 时作废旧卡重新生成）
  const prepareInvite = async (force = false) => {
    const { currentBaby: baby, babies: list } = useBabyStore.getState()
    const target = baby || list[0]
    if (!target) return
    try {
      const res = await familyApi.createInvite(target.id, force)
      setInviteInfo({
        inviteCode: res.data.inviteCode,
        expiresAt: res.data.expiresAt,
      })
    } catch (error) {
      if (force) {
        Taro.showToast({ title: '生成失败，请重试', icon: 'none' })
      }
    }
  }

  // 分享卡片（转发不断链：落地页可继续转发）
  useShareAppMessage(() => ({
    title: `${userInfo?.nickname || '家人'}邀请你一起记录宝宝成长`,
    path: `/pages/family-join/index?invite=${inviteInfo?.inviteCode || ''}`,
  }))

  const handleDeleteMember = async (member: Member) => {
    const name = member.user?.nickname || '该成员'
    const res = await Taro.showModal({
      title: '移除成员',
      content: `确定要移除 ${name} 吗？`,
    })
    if (res.confirm) {
      try {
        await familyApi.removeMember(member.id)
        Taro.showToast({ title: '已移除', icon: 'success' })
        loadData()
      } catch (error) {
        Taro.showToast({ title: '操作失败', icon: 'none' })
      }
    }
  }

  const handleMemberTap = (member: Member) => {
    // 创建者点其他成员卡片：移除确认（对应 UI 的 ›）
    if (isOwner && member.userId !== userInfo?.id) {
      handleDeleteMember(member)
    }
  }

  const handleCopyInviteCode = () => {
    if (!inviteInfo) return
    Taro.setClipboardData({
      data: inviteInfo.inviteCode,
      success: () => {
        Taro.showToast({ title: '已复制', icon: 'success' })
      },
    })
  }

  const handleRegenerate = async () => {
    const res = await Taro.showModal({
      title: '重新生成邀请卡',
      content: '旧邀请卡将立即失效，已分享出去的卡片无法再加入，确定重新生成吗？',
      confirmText: '重新生成',
    })
    if (res.confirm) {
      prepareInvite(true)
    }
  }

  const handleAcceptInvite = async () => {
    if (!inputInviteCode.trim()) {
      Taro.showToast({ title: '请输入邀请码', icon: 'none' })
      return
    }
    try {
      await familyApi.acceptInvite(inputInviteCode.trim())
      Taro.showToast({ title: '加入成功', icon: 'success' })
      setInputInviteCode('')
      loadData()
    } catch (error) {
      Taro.showToast({ title: '邀请码无效或已绑定家庭', icon: 'none' })
    }
  }

  const handleLeaveFamily = async () => {
    const res = await Taro.showModal({
      title: '退出家庭',
      content: '退出后将无法查看该家庭的宝贝信息，确定要退出吗？',
      confirmText: '确定退出',
      confirmColor: '#FF8A8A',
    })
    if (res.confirm) {
      try {
        await familyApi.leaveFamily()
        Taro.showToast({ title: '已退出家庭', icon: 'success' })
        loadData()
      } catch (error) {
        Taro.showToast({ title: '操作失败', icon: 'none' })
      }
    }
  }

  const getRoleText = (role?: string) => ROLE_MAP[role || ''] || '家人'

  const formatExpiry = (iso: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    return `${d.getMonth() + 1}月${d.getDate()}日`
  }

  return (
    <View className="family-page">
      {/* 返回按钮：与微信胶囊同带对称、fixed 不随滚动 */}
      <View
        className="family-back"
        style={{
          top: `${menuBand.top}px`,
          left: `${menuBand.leftInset}px`,
          width: `${menuBand.height}px`,
          height: `${menuBand.height}px`,
        }}
        onClick={handleBack}
      >
        <Text className="family-back-icon">‹</Text>
      </View>

      {/* 导航行：居中标题（高度=胶囊高度，与胶囊垂直居中） */}
      <View
        className="family-navbar"
        style={{
          paddingTop: `${menuBand.top}px`,
          height: `${menuBand.height}px`,
          marginBottom: '14px',
        }}
      >
        <Text className="family-navbar-title">家庭成员</Text>
      </View>

      {/* 头部：大标题 + 副标题 + 插画 */}
      <View className="family-hero">
        <View className="family-hero-copy">
          <Text className="family-hero-title">家庭成员</Text>
          <Text className="family-hero-desc">管理家庭成员，守护家人健康</Text>
        </View>
        <Image
          className="family-hero-illustration"
          src={familyIllustration}
          mode="aspectFit"
        />
      </View>

      {/* 成员列表 */}
      {members.length === 0 ? (
        <View className="family-card members-empty">
          <Text className="members-empty-text">暂无其他成员</Text>
          <Text className="members-empty-desc">分享邀请卡给家人，共同记录宝宝成长</Text>
        </View>
      ) : (
        <View className="family-members">
          {members.map(member => (
            <View
              key={member.id}
              className="family-card member-card"
              onClick={() => handleMemberTap(member)}
            >
              <View className="member-avatar">
                {member.user?.avatar ? (
                  <Image className="member-avatar-img" src={member.user.avatar} mode="aspectFill" />
                ) : (
                  <Image className="member-avatar-icon" src={personPinkIcon} />
                )}
              </View>
              <View className="member-info">
                <Text className="member-name">{member.user?.nickname || '未知用户'}</Text>
                <View className="member-role-pill">
                  <Text className="member-role-pill-text">
                    {getRoleText(member.user?.role || member.role)}
                  </Text>
                </View>
              </View>
              <Text className="member-arrow">›</Text>
            </View>
          ))}
        </View>
      )}

      {/* 邀请家人 - only for owner */}
      {isOwner && (
        <View className="family-card invite-card">
          <View className="edit-label-row">
            <View className="edit-label-dot" />
            <Text className="edit-label">邀请家人</Text>
          </View>
          {inviteInfo ? (
            <View className="invite-panel">
              <View className="invite-code-box">
                <Text className="invite-code-text">{inviteInfo.inviteCode}</Text>
                <View className="invite-copy-btn" onClick={handleCopyInviteCode}>
                  <Text>复制</Text>
                </View>
              </View>
              <Text className="invite-expiry">
                有效期至 {formatExpiry(inviteInfo.expiresAt)}，卡片可分享给多位家人
              </Text>
              <Button className="invite-share-btn" openType="share">
                <Text className="invite-share-btn-text">微信分享邀请卡</Text>
              </Button>
              <View className="invite-regen" onClick={handleRegenerate}>
                <Text className="invite-regen-text">重新生成（旧卡立即失效）</Text>
              </View>
            </View>
          ) : (
            <View className="invite-generate-btn" onClick={() => prepareInvite()}>
              <Text>生成邀请卡</Text>
            </View>
          )}
        </View>
      )}

      {/* Join family - hidden if already bound */}
      {!isBound && (
        <View className="family-card invite-card">
          <View className="edit-label-row">
            <View className="edit-label-dot" />
            <Text className="edit-label">输入邀请码加入</Text>
          </View>
          <View className="invite-input-row">
            <Input
              className="invite-input"
              value={inputInviteCode}
              onInput={e => setInputInviteCode(e.detail.value)}
              placeholder="请输入邀请码"
              maxlength={8}
            />
            <View className="invite-join-btn" onClick={handleAcceptInvite}>
              <Text>加入</Text>
            </View>
          </View>
        </View>
      )}

      {/* 退出家庭 - only for members */}
      {!isOwner && isBound && (
        <View className="leave-family-btn" onClick={handleLeaveFamily}>
          <Image className="leave-family-icon" src={logoutWhiteIcon} />
          <Text className="leave-family-text">退出家庭</Text>
        </View>
      )}
    </View>
  )
}
